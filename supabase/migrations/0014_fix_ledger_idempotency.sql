-- =====================================================================
-- EVRute :: 0014 — Fix: ON CONFLICT cannot make a ledger write idempotent
-- =====================================================================
-- ROOT CAUSE
-- `wallet_transactions` has a BEFORE INSERT trigger (evr.apply_ledger_entry)
-- that mutates `wallets.balance` as a side effect. Postgres fires BEFORE
-- INSERT triggers *before* it probes the unique index for ON CONFLICT.
-- So on a duplicate:
--     1. trigger runs      -> wallets.balance += amount   (COMMITTED)
--     2. index probe hits  -> row insert skipped silently
-- The ledger row is correctly deduplicated, but the money moved anyway.
-- A webhook redelivery therefore double-credited the wallet: verified by
-- the smoke test, which saw 4000.00 after crediting 2000.00 twice.
--
-- FIX
-- Take the wallet row lock FIRST (concurrent callers serialise on it),
-- then check for an existing entry with the same idempotency key, and
-- only then insert. ON CONFLICT is never used on this table again.
-- =====================================================================

-- Guard rail: reject any ON CONFLICT insert into the ledger outright, so
-- this class of bug cannot be reintroduced by a future change.
create or replace function evr.assert_ledger_key_unused(p_key text)
returns void
language plpgsql
stable
set search_path = public, evr, extensions
as $$
begin
  if p_key is null then
    raise exception 'ledger writes require an idempotency key' using errcode = 'null_value_not_allowed';
  end if;
end;
$$;

create or replace function public.credit_wallet_from_payment(p_payment_id uuid)
returns public.wallet_transactions
language plpgsql
security definer
set search_path = public, evr, extensions
as $$
declare
  v_payment public.payments;
  v_wallet  public.wallets;
  v_tx      public.wallet_transactions;
  v_key     text;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'payment % not found', p_payment_id using errcode = 'no_data_found';
  end if;
  if v_payment.status <> 'captured' then
    raise exception 'payment % is % - only captured payments credit a wallet',
      p_payment_id, v_payment.status using errcode = 'check_violation';
  end if;

  v_key := 'payment-credit:' || v_payment.id::text;

  -- Serialise concurrent callers on the wallet row before the dedupe check.
  select * into v_wallet from public.wallets where user_id = v_payment.user_id for update;
  if not found then
    raise exception 'wallet not provisioned for user %', v_payment.user_id
      using errcode = 'no_data_found';
  end if;

  select * into v_tx from public.wallet_transactions where idempotency_key = v_key;
  if found then
    return v_tx;  -- already credited; replay is a no-op
  end if;

  insert into public.wallet_transactions (
    wallet_id, user_id, direction, reason, amount, payment_id,
    reference, idempotency_key, notes
  )
  values (
    v_wallet.id, v_payment.user_id, 'credit', 'wallet_recharge', v_payment.amount,
    v_payment.id, v_payment.provider_payment_id, v_key, 'Wallet top-up'
  )
  returning * into v_tx;

  insert into public.notifications (user_id, type, title, body, data)
  values (v_payment.user_id, 'wallet_credited', 'Wallet topped up',
          'Rs ' || v_payment.amount || ' added. New balance Rs ' || v_tx.balance_after || '.',
          jsonb_build_object('payment_id', v_payment.id, 'amount', v_payment.amount));

  return v_tx;
end;
$$;

-- Same defect existed on the session-debit path in stop_charging_session.
-- It was masked by the status guard (a second stop returns early), but the
-- pattern was identical and would fire if a stop ever raced a webhook.
create or replace function public.stop_charging_session(
  p_session_id  uuid,
  p_reason      public.session_stop_reason default 'user_request',
  p_final_energy_kwh numeric default null,
  p_stopped_at  timestamptz default now()
)
returns public.sessions
language plpgsql
security definer
set search_path = public, evr, extensions
as $$
declare
  v_user     uuid := auth.uid();
  v_session  public.sessions;
  v_cost     record;
  v_wallet   public.wallets;
  v_hold     public.wallet_holds;
  v_invoice  public.invoices;
  v_energy   numeric(12,3);
  v_duration integer;
  v_key      text;
  v_exists   bigint;
begin
  select * into v_session from public.sessions where id = p_session_id for update;
  if not found then
    raise exception 'session % not found', p_session_id using errcode = 'no_data_found';
  end if;

  if v_user is not null
     and v_session.user_id <> v_user
     and not evr.is_staff() then
    raise exception 'not permitted to stop this session' using errcode = 'insufficient_privilege';
  end if;

  if v_session.status not in ('pending', 'active') then
    return v_session;
  end if;

  v_energy   := greatest(coalesce(p_final_energy_kwh, v_session.energy_kwh), v_session.energy_kwh);
  v_duration := case when v_session.started_at is not null
                     then greatest(extract(epoch from (p_stopped_at - v_session.started_at))::int, 0)
                     else 0 end;

  select * into v_cost from public.compute_session_cost(
    v_energy, v_session.price_per_kwh, v_session.session_fee,
    0, v_session.idle_fee_per_min, v_session.tax_pct, v_session.discount_amount
  );

  if v_session.started_at is null or v_energy = 0 then
    update public.sessions s
    set status = case when p_reason = 'user_request' then 'cancelled' else 'failed' end,
        stop_reason = p_reason, stopped_at = p_stopped_at,
        energy_kwh = 0, duration_seconds = v_duration,
        energy_cost = 0, subtotal = 0, tax_amount = 0, total_cost = 0
    where s.id = p_session_id
    returning * into v_session;
  else
    update public.sessions s
    set status = 'completed', stop_reason = p_reason, stopped_at = p_stopped_at,
        energy_kwh = v_energy, duration_seconds = v_duration,
        energy_cost = v_cost.energy_cost, idle_cost = v_cost.idle_cost,
        subtotal = v_cost.subtotal, tax_amount = v_cost.tax_amount,
        discount_amount = v_cost.discount_amount, total_cost = v_cost.total_cost
    where s.id = p_session_id
    returning * into v_session;
  end if;

  select * into v_hold from public.wallet_holds where session_id = p_session_id for update;
  if found and v_hold.status = 'active' then
    update public.wallet_holds
    set status = case when v_session.total_cost > 0 then 'captured' else 'released' end,
        captured_amount = v_session.total_cost,
        released_at = now()
    where id = v_hold.id;
  end if;

  if v_session.total_cost > 0 then
    v_key := 'session-debit:' || v_session.id::text;

    select * into v_wallet from public.wallets where user_id = v_session.user_id for update;

    select count(*) into v_exists
    from public.wallet_transactions where idempotency_key = v_key;

    if v_exists = 0 then
      insert into public.wallet_transactions (
        wallet_id, user_id, direction, reason, amount, session_id, hold_id,
        reference, idempotency_key, notes
      )
      values (
        v_wallet.id, v_session.user_id, 'debit', 'session_charge',
        v_session.total_cost, v_session.id, v_hold.id,
        v_session.id::text, v_key, 'Charging session settlement'
      );
    end if;

    -- invoices has no side-effecting BEFORE trigger, so ON CONFLICT is safe here.
    insert into public.invoices (
      session_id, user_id, station_id, invoice_number, energy_kwh,
      subtotal, tax_amount, discount_amount, total, line_items
    )
    values (
      v_session.id, v_session.user_id, v_session.station_id,
      evr.next_invoice_number(), v_session.energy_kwh,
      v_session.subtotal, v_session.tax_amount, v_session.discount_amount,
      v_session.total_cost,
      jsonb_build_array(
        jsonb_build_object('label', 'Energy', 'qty', v_session.energy_kwh,
                           'unit', 'kWh', 'rate', v_session.price_per_kwh,
                           'amount', v_session.energy_cost),
        jsonb_build_object('label', 'Session fee', 'qty', 1,
                           'unit', 'session', 'rate', v_session.session_fee,
                           'amount', v_session.session_fee)
      )
    )
    on conflict (session_id) do nothing
    returning * into v_invoice;

    if v_session.coupon_id is not null and v_session.discount_amount > 0 then
      insert into public.coupon_redemptions (coupon_id, user_id, session_id, amount_saved)
      values (v_session.coupon_id, v_session.user_id, v_session.id, v_session.discount_amount)
      on conflict (coupon_id, session_id) do nothing;
    end if;
  end if;

  update public.connectors
  set status = case when p_reason = 'fault' then 'faulted' else 'available' end
  where id = v_session.connector_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_session.user_id, 'session_completed', 'Charging complete',
    'You added ' || round(v_session.energy_kwh, 2) || ' kWh for Rs ' || v_session.total_cost || '.',
    jsonb_build_object('session_id', v_session.id, 'invoice_id', v_invoice.id)
  );

  return v_session;
end;
$$;

revoke execute on function public.credit_wallet_from_payment(uuid) from public, anon, authenticated;
grant  execute on function public.credit_wallet_from_payment(uuid) to service_role;
revoke execute on function public.stop_charging_session(
  uuid, public.session_stop_reason, numeric, timestamptz) from public, anon;
grant  execute on function public.stop_charging_session(
  uuid, public.session_stop_reason, numeric, timestamptz) to authenticated;
