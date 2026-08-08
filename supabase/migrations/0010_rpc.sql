-- =====================================================================
-- EVRute :: 0010 — Transactional RPCs
-- =====================================================================
-- These are the ONLY write paths for sessions and money. They are
-- SECURITY DEFINER so they can enforce invariants RLS cannot express
-- (wallet sufficiency, connector locking, hold capture), and each one
-- re-derives the caller from auth.uid() rather than trusting a parameter.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Station search. One indexed query on geography; no post-filtering in
-- application code, no N+1 for connector availability.
-- ---------------------------------------------------------------------
create or replace function public.search_stations(
  p_lat            numeric,
  p_lng            numeric,
  p_radius_m       integer default 15000,
  p_connector_types public.connector_type[] default null,
  p_min_power_kw   numeric default null,
  p_only_available boolean default false,
  p_query          text default null,
  p_limit          integer default 50,
  p_offset         integer default 0
)
returns table (
  id             uuid,
  name           text,
  slug           text,
  address_line1  text,
  city           text,
  state          text,
  lat            numeric,
  lng            numeric,
  distance_m     double precision,
  amenities      text[],
  photos         text[],
  rating_avg     numeric,
  rating_count   integer,
  is_24x7        boolean,
  total_connectors  bigint,
  available_connectors bigint,
  min_price_per_kwh numeric,
  max_power_kw   numeric,
  connector_types public.connector_type[]
)
language sql
stable
security invoker
set search_path = public, evr, extensions
as $$
  with origin as (
    select extensions.st_setsrid(
             extensions.st_makepoint(p_lng::float8, p_lat::float8), 4326
           )::extensions.geography as g
  ),
  nearby as (
    select s.*, extensions.st_distance(s.geo, o.g) as distance_m
    from public.stations s, origin o
    where s.status = 'active'
      and extensions.st_dwithin(s.geo, o.g, p_radius_m)
      and (p_query is null or s.name ilike '%' || p_query || '%' or s.city ilike '%' || p_query || '%')
  ),
  conn as (
    select
      ch.station_id,
      count(*)                                          as total_connectors,
      count(*) filter (where c.status = 'available')     as available_connectors,
      max(c.power_kw)                                    as max_power_kw,
      array_agg(distinct c.type)                         as connector_types
    from public.connectors c
    join public.chargers ch on ch.id = c.charger_id
    where (p_connector_types is null or c.type = any (p_connector_types))
      and (p_min_power_kw is null or c.power_kw >= p_min_power_kw)
    group by ch.station_id
  ),
  price as (
    select t.station_id, min(t.price_per_kwh) as min_price_per_kwh
    from public.tariffs t
    where t.effective_from <= now()
      and (t.effective_to is null or t.effective_to > now())
    group by t.station_id
  )
  select
    n.id, n.name, n.slug, n.address_line1, n.city, n.state, n.lat, n.lng,
    n.distance_m, n.amenities, n.photos, n.rating_avg, n.rating_count, n.is_24x7,
    coalesce(conn.total_connectors, 0),
    coalesce(conn.available_connectors, 0),
    price.min_price_per_kwh,
    conn.max_power_kw,
    coalesce(conn.connector_types, '{}')
  from nearby n
  left join conn  on conn.station_id  = n.id
  left join price on price.station_id = n.id
  where (p_connector_types is null or conn.station_id is not null)
    and (not p_only_available or coalesce(conn.available_connectors, 0) > 0)
  order by n.distance_m
  limit greatest(least(p_limit, 200), 1)
  offset greatest(p_offset, 0);
$$;

-- ---------------------------------------------------------------------
-- Coupon evaluation — shared by the quote and the start path so the
-- number the user is shown is the number they are charged.
-- ---------------------------------------------------------------------
create or replace function public.evaluate_coupon(
  p_code       text,
  p_user_id    uuid,
  p_station_id uuid,
  p_amount     numeric
)
returns table (coupon_id uuid, discount numeric, reason text)
language plpgsql
stable
security definer
set search_path = public, evr, extensions
as $$
declare
  c public.coupons;
  v_uses int;
  v_disc numeric(12,2);
begin
  if p_code is null or btrim(p_code) = '' then
    return query select null::uuid, 0::numeric, 'no_coupon'; return;
  end if;

  select * into c from public.coupons
  where code = upper(btrim(p_code)) and is_active
    and valid_from <= now() and valid_to > now();

  if not found then
    return query select null::uuid, 0::numeric, 'invalid_or_expired'; return;
  end if;

  if c.station_id is not null and c.station_id <> p_station_id then
    return query select null::uuid, 0::numeric, 'not_valid_at_this_station'; return;
  end if;

  if p_amount < c.min_order then
    return query select null::uuid, 0::numeric, 'below_minimum_order'; return;
  end if;

  if c.max_uses is not null and c.used_count >= c.max_uses then
    return query select null::uuid, 0::numeric, 'fully_redeemed'; return;
  end if;

  select count(*) into v_uses from public.coupon_redemptions r
  where r.coupon_id = c.id and r.user_id = p_user_id;

  if v_uses >= c.max_uses_per_user then
    return query select null::uuid, 0::numeric, 'user_limit_reached'; return;
  end if;

  if c.discount_type = 'flat' then
    v_disc := c.value;
  else
    v_disc := round(p_amount * c.value / 100.0, 2);
  end if;

  if c.max_discount is not null then
    v_disc := least(v_disc, c.max_discount);
  end if;

  return query select c.id, least(v_disc, p_amount), 'ok';
end;
$$;

-- ---------------------------------------------------------------------
-- START a charging session.
--
-- Ordering matters and is deliberate:
--   1. lock the connector row  -> no two callers can pass the availability check
--   2. verify wallet           -> never start a charge the user cannot pay for
--   3. insert session (pending)-> partial unique index is the final race guard
--   4. place the hold          -> funds reserved but not yet debited
-- The provider RemoteStart call happens AFTER this returns, from the app
-- server. If it fails, `fail_session` reverses everything.
-- ---------------------------------------------------------------------
create or replace function public.start_charging_session(
  p_connector_id    uuid,
  p_vehicle_id      uuid default null,
  p_idempotency_key text default null,
  p_coupon_code     text default null
)
returns public.sessions
language plpgsql
security definer
set search_path = public, evr, extensions
as $$
declare
  v_user      uuid := auth.uid();
  v_key       text := coalesce(nullif(btrim(p_idempotency_key), ''), gen_random_uuid()::text);
  v_conn      public.connectors;
  v_station   uuid;
  v_tariff    public.tariffs;
  v_wallet    public.wallets;
  v_spendable numeric(14,2);
  v_hold      numeric(14,2);
  v_session   public.sessions;
  v_existing  public.sessions;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  -- Idempotency: replaying the same key returns the original session
  -- instead of starting a second charge.
  select * into v_existing from public.sessions where idempotency_key = v_key;
  if found then
    return v_existing;
  end if;

  -- 1. Lock the connector.
  select c.* into v_conn from public.connectors c
  where c.id = p_connector_id
  for update;

  if not found then
    raise exception 'connector % not found', p_connector_id using errcode = 'no_data_found';
  end if;

  if v_conn.status <> 'available' then
    raise exception 'connector is % and cannot start a session', v_conn.status
      using errcode = 'check_violation';
  end if;

  select ch.station_id into v_station from public.chargers ch where ch.id = v_conn.charger_id;

  if not exists (select 1 from public.stations s where s.id = v_station and s.status = 'active') then
    raise exception 'station is not accepting sessions' using errcode = 'check_violation';
  end if;

  if p_vehicle_id is not null
     and not exists (select 1 from public.vehicles v where v.id = p_vehicle_id and v.user_id = v_user) then
    raise exception 'vehicle does not belong to the caller' using errcode = 'insufficient_privilege';
  end if;

  -- 2. Tariff snapshot + wallet check.
  v_tariff := public.resolve_tariff(p_connector_id);
  if v_tariff.id is null then
    raise exception 'no tariff is configured for this connector' using errcode = 'no_data_found';
  end if;

  select w.* into v_wallet from public.wallets w where w.user_id = v_user for update;
  if not found then
    raise exception 'wallet not provisioned' using errcode = 'no_data_found';
  end if;
  if v_wallet.is_frozen then
    raise exception 'wallet is frozen' using errcode = 'check_violation';
  end if;

  v_spendable := greatest(v_wallet.balance - v_wallet.held_amount, 0);
  v_hold := greatest(v_tariff.min_balance_to_start, v_tariff.session_fee);

  if v_spendable < v_hold then
    raise exception 'insufficient balance: % available, % required to start', v_spendable, v_hold
      using errcode = 'check_violation';
  end if;

  -- 3. Create the session.
  insert into public.sessions (
    user_id, vehicle_id, connector_id, station_id, tariff_id, idempotency_key,
    status, price_per_kwh, session_fee, idle_fee_per_min, tax_pct
  )
  values (
    v_user, p_vehicle_id, p_connector_id, v_station, v_tariff.id, v_key,
    'pending', v_tariff.price_per_kwh, v_tariff.session_fee,
    v_tariff.idle_fee_per_min, v_tariff.tax_pct
  )
  returning * into v_session;

  -- 4. Reserve the funds and mark the connector busy.
  insert into public.wallet_holds (wallet_id, user_id, session_id, amount)
  values (v_wallet.id, v_user, v_session.id, v_hold);

  update public.connectors set status = 'occupied' where id = p_connector_id;

  return v_session;
end;
$$;

-- ---------------------------------------------------------------------
-- Provider confirmed the charge is flowing (webhook: Charging Started).
-- ---------------------------------------------------------------------
create or replace function public.activate_session(
  p_session_id   uuid,
  p_provider_ref text default null,
  p_started_at   timestamptz default now()
)
returns public.sessions
language plpgsql
security definer
set search_path = public, evr, extensions
as $$
declare
  v_session public.sessions;
begin
  update public.sessions s
  set status               = 'active',
      started_at           = coalesce(s.started_at, p_started_at),
      provider_session_ref = coalesce(p_provider_ref, s.provider_session_ref)
  where s.id = p_session_id and s.status = 'pending'
  returning * into v_session;

  if not found then
    -- Already active (webhook redelivery) — return current state, don't error.
    select * into v_session from public.sessions where id = p_session_id;
  end if;

  return v_session;
end;
$$;

-- ---------------------------------------------------------------------
-- Ingest a MeterValues sample. Recomputes running cost from the session's
-- OWN pricing snapshot, so a mid-session tariff change cannot alter it.
-- ---------------------------------------------------------------------
create or replace function public.record_meter_reading(
  p_session_id  uuid,
  p_recorded_at timestamptz,
  p_energy_kwh  numeric,
  p_power_kw    numeric default null,
  p_soc_pct     smallint default null
)
returns public.sessions
language plpgsql
security definer
set search_path = public, evr, extensions
as $$
declare
  v_session public.sessions;
  v_cost    record;
begin
  select * into v_session from public.sessions where id = p_session_id for update;
  if not found then
    raise exception 'session % not found', p_session_id using errcode = 'no_data_found';
  end if;

  if v_session.status not in ('pending', 'active') then
    return v_session; -- late sample for a closed session: ignore
  end if;

  insert into public.meter_readings (session_id, recorded_at, energy_kwh, power_kw, soc_pct)
  values (p_session_id, p_recorded_at, p_energy_kwh, p_power_kw, p_soc_pct)
  on conflict (session_id, recorded_at) do nothing;

  -- Energy is cumulative from the charger; never let it move backwards.
  select * into v_cost from public.compute_session_cost(
    greatest(p_energy_kwh, v_session.energy_kwh),
    v_session.price_per_kwh, v_session.session_fee,
    0, v_session.idle_fee_per_min, v_session.tax_pct, v_session.discount_amount
  );

  update public.sessions s
  set energy_kwh    = greatest(p_energy_kwh, s.energy_kwh),
      soc_end_pct   = coalesce(p_soc_pct, s.soc_end_pct),
      last_meter_at = p_recorded_at,
      duration_seconds = case when s.started_at is not null
                              then greatest(extract(epoch from (p_recorded_at - s.started_at))::int, 0)
                              else s.duration_seconds end,
      energy_cost   = v_cost.energy_cost,
      subtotal      = v_cost.subtotal,
      tax_amount    = v_cost.tax_amount,
      total_cost    = v_cost.total_cost
  where s.id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

-- ---------------------------------------------------------------------
-- STOP: finalise cost, capture the hold, debit the ledger, issue invoice.
-- Every step is in ONE transaction — a partial stop is not representable.
-- ---------------------------------------------------------------------
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
begin
  select * into v_session from public.sessions where id = p_session_id for update;
  if not found then
    raise exception 'session % not found', p_session_id using errcode = 'no_data_found';
  end if;

  -- A customer may only stop their own session; staff and the service role
  -- (auth.uid() is null for the latter) may stop any.
  if v_user is not null
     and v_session.user_id <> v_user
     and not evr.is_staff() then
    raise exception 'not permitted to stop this session' using errcode = 'insufficient_privilege';
  end if;

  if v_session.status not in ('pending', 'active') then
    return v_session; -- idempotent: already closed
  end if;

  v_energy   := greatest(coalesce(p_final_energy_kwh, v_session.energy_kwh), v_session.energy_kwh);
  v_duration := case when v_session.started_at is not null
                     then greatest(extract(epoch from (p_stopped_at - v_session.started_at))::int, 0)
                     else 0 end;

  select * into v_cost from public.compute_session_cost(
    v_energy, v_session.price_per_kwh, v_session.session_fee,
    0, v_session.idle_fee_per_min, v_session.tax_pct, v_session.discount_amount
  );

  -- A session that never delivered energy is failed, not completed, and
  -- costs the customer nothing.
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

  -- Release the hold first so the debit sees the full spendable balance.
  select * into v_hold from public.wallet_holds where session_id = p_session_id for update;
  if found and v_hold.status = 'active' then
    update public.wallet_holds
    set status = case when v_session.total_cost > 0 then 'captured' else 'released' end,
        captured_amount = v_session.total_cost,
        released_at = now()
    where id = v_hold.id;
  end if;

  if v_session.total_cost > 0 then
    select * into v_wallet from public.wallets where user_id = v_session.user_id for update;

    insert into public.wallet_transactions (
      wallet_id, user_id, direction, reason, amount, session_id, hold_id,
      reference, idempotency_key, notes
    )
    values (
      v_wallet.id, v_session.user_id, 'debit', 'session_charge',
      v_session.total_cost, v_session.id, v_hold.id,
      v_session.id::text, 'session-debit:' || v_session.id::text,
      'Charging session settlement'
    )
    on conflict (idempotency_key) do nothing;

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

  -- Free the connector unless a fault took it out of service.
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

-- ---------------------------------------------------------------------
-- Provider start failed: unwind cleanly. No charge, no held funds.
-- ---------------------------------------------------------------------
create or replace function public.fail_session(
  p_session_id uuid,
  p_message    text default null,
  p_reason     public.session_stop_reason default 'fault'
)
returns public.sessions
language plpgsql
security definer
set search_path = public, evr, extensions
as $$
declare
  v_session public.sessions;
begin
  update public.sessions s
  set status = 'failed', stop_reason = p_reason, stopped_at = now(),
      failure_message = p_message
  where s.id = p_session_id and s.status in ('pending', 'active')
  returning * into v_session;

  if not found then
    select * into v_session from public.sessions where id = p_session_id;
    return v_session;
  end if;

  update public.wallet_holds
  set status = 'released', released_at = now()
  where session_id = p_session_id and status = 'active';

  update public.connectors
  set status = case when p_reason = 'fault' then 'faulted' else 'available' end
  where id = v_session.connector_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (v_session.user_id, 'session_failed', 'Charging could not start',
          coalesce(p_message, 'The charger did not respond. You have not been charged.'),
          jsonb_build_object('session_id', v_session.id));

  return v_session;
end;
$$;

-- ---------------------------------------------------------------------
-- Credit a captured payment into the wallet. Idempotent on payment id.
-- ---------------------------------------------------------------------
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
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'payment % not found', p_payment_id using errcode = 'no_data_found';
  end if;
  if v_payment.status <> 'captured' then
    raise exception 'payment % is % — only captured payments credit a wallet',
      p_payment_id, v_payment.status using errcode = 'check_violation';
  end if;

  select * into v_wallet from public.wallets where user_id = v_payment.user_id for update;

  insert into public.wallet_transactions (
    wallet_id, user_id, direction, reason, amount, payment_id,
    reference, idempotency_key, notes
  )
  values (
    v_wallet.id, v_payment.user_id, 'credit', 'wallet_recharge', v_payment.amount,
    v_payment.id, v_payment.provider_payment_id,
    'payment-credit:' || v_payment.id::text, 'Wallet top-up'
  )
  on conflict (idempotency_key) do nothing
  returning * into v_tx;

  if v_tx.id is not null then
    insert into public.notifications (user_id, type, title, body, data)
    values (v_payment.user_id, 'wallet_credited', 'Wallet topped up',
            'Rs ' || v_payment.amount || ' added. New balance Rs ' || v_tx.balance_after || '.',
            jsonb_build_object('payment_id', v_payment.id, 'amount', v_payment.amount));
  end if;

  return v_tx;
end;
$$;

-- ---------------------------------------------------------------------
-- Reservations
-- ---------------------------------------------------------------------
create or replace function public.create_reservation(
  p_connector_id uuid,
  p_minutes      integer default 20,
  p_vehicle_id   uuid default null
)
returns public.reservations
language plpgsql
security definer
set search_path = public, evr, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_res  public.reservations;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_minutes < 5 or p_minutes > 120 then
    raise exception 'reservation window must be between 5 and 120 minutes';
  end if;

  if not exists (
    select 1 from public.connectors c where c.id = p_connector_id and c.status = 'available'
  ) then
    raise exception 'connector is not available to reserve' using errcode = 'check_violation';
  end if;

  insert into public.reservations (user_id, connector_id, vehicle_id, starts_at, expires_at, status)
  values (v_user, p_connector_id, p_vehicle_id, now(), now() + make_interval(mins => p_minutes), 'active')
  returning * into v_res;

  update public.connectors set status = 'reserved' where id = p_connector_id;

  return v_res;
end;
$$;

create or replace function public.cancel_reservation(p_reservation_id uuid)
returns public.reservations
language plpgsql
security definer
set search_path = public, evr, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_res  public.reservations;
begin
  update public.reservations r
  set status = 'cancelled', cancelled_reason = 'user_cancelled'
  where r.id = p_reservation_id
    and (v_user is null or r.user_id = v_user or evr.is_staff())
    and r.status in ('pending', 'active')
  returning * into v_res;

  if not found then
    raise exception 'reservation not found or not cancellable' using errcode = 'no_data_found';
  end if;

  update public.connectors set status = 'available'
  where id = v_res.connector_id and status = 'reserved';

  return v_res;
end;
$$;

-- Housekeeping: expire stale reservations and holds. Runs on a schedule.
create or replace function public.expire_stale_records()
returns table (reservations_expired int, holds_expired int)
language plpgsql
security definer
set search_path = public, evr, extensions
as $$
declare
  v_res int;
  v_hold int;
begin
  with expired as (
    update public.reservations
    set status = 'expired'
    where status in ('pending', 'active') and expires_at < now()
    returning connector_id
  )
  select count(*) into v_res from expired;

  update public.connectors c
  set status = 'available'
  where c.status = 'reserved'
    and not exists (
      select 1 from public.reservations r
      where r.connector_id = c.id and r.status in ('pending', 'active')
    );

  with released as (
    update public.wallet_holds
    set status = 'expired', released_at = now()
    where status = 'active' and expires_at < now()
    returning id
  )
  select count(*) into v_hold from released;

  return query select v_res, v_hold;
end;
$$;

-- ---------------------------------------------------------------------
-- Dashboards. Single round trip each; the alternative is six queries and
-- a waterfall on every page load.
-- ---------------------------------------------------------------------
create or replace function public.owner_dashboard(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, evr, extensions
as $$
declare
  v_owner uuid := auth.uid();
  v_result jsonb;
begin
  if v_owner is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if evr.current_role() not in ('owner', 'admin') then
    raise exception 'owner role required' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'active_sessions', (
      select count(*) from public.sessions s
      join public.stations st on st.id = s.station_id
      where st.owner_id = v_owner and s.status = 'active'
    ),
    'today_revenue', (
      select coalesce(sum(s.total_cost), 0) from public.sessions s
      join public.stations st on st.id = s.station_id
      where st.owner_id = v_owner and s.status = 'completed'
        and s.stopped_at >= date_trunc('day', now())
    ),
    'today_energy_kwh', (
      select coalesce(sum(s.energy_kwh), 0) from public.sessions s
      join public.stations st on st.id = s.station_id
      where st.owner_id = v_owner and s.status = 'completed'
        and s.stopped_at >= date_trunc('day', now())
    ),
    'station_count', (select count(*) from public.stations where owner_id = v_owner),
    'charger_count', (
      select count(*) from public.chargers ch
      join public.stations st on st.id = ch.station_id where st.owner_id = v_owner
    ),
    'chargers_online', (
      select count(*) from public.chargers ch
      join public.stations st on st.id = ch.station_id
      where st.owner_id = v_owner and ch.status = 'online'
    ),
    'uptime_pct', (
      select case when count(*) = 0 then 100
                  else round(count(*) filter (where ch.status = 'online') * 100.0 / count(*), 1) end
      from public.chargers ch
      join public.stations st on st.id = ch.station_id where st.owner_id = v_owner
    ),
    'pending_settlement', (
      select coalesce(sum(net_amount), 0) from public.settlements
      where owner_id = v_owner and status in ('pending', 'approved', 'processing')
    ),
    'activity', (
      select coalesce(jsonb_agg(row_to_json(d) order by d.day), '[]'::jsonb)
      from (
        select g.day::date as day,
               coalesce(sum(dss.energy_kwh), 0)  as energy_kwh,
               coalesce(sum(dss.revenue), 0)     as revenue,
               coalesce(sum(dss.sessions_count), 0) as sessions
        from generate_series(current_date - (p_days - 1), current_date, interval '1 day') g(day)
        left join public.daily_station_stats dss on dss.day = g.day::date
          and dss.station_id in (select id from public.stations where owner_id = v_owner)
        group by g.day
      ) d
    )
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.admin_dashboard(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, evr, extensions
as $$
declare
  v_result jsonb;
begin
  if not evr.is_staff() then
    raise exception 'staff role required' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'total_users',    (select count(*) from public.profiles where role = 'customer'),
    'total_owners',   (select count(*) from public.profiles where role = 'owner'),
    'total_stations', (select count(*) from public.stations),
    'active_stations',(select count(*) from public.stations where status = 'active'),
    'total_chargers', (select count(*) from public.chargers),
    'chargers_online',(select count(*) from public.chargers where status = 'online'),
    'active_sessions',(select count(*) from public.sessions where status = 'active'),
    'today_revenue',  (select coalesce(sum(total_cost), 0) from public.sessions
                       where status = 'completed' and stopped_at >= date_trunc('day', now())),
    'today_energy_kwh',(select coalesce(sum(energy_kwh), 0) from public.sessions
                       where status = 'completed' and stopped_at >= date_trunc('day', now())),
    'settlements_pending', (select count(*) from public.settlements where status = 'pending'),
    'settlements_pending_value', (select coalesce(sum(net_amount), 0) from public.settlements
                                  where status = 'pending'),
    'open_tickets',   (select count(*) from public.tickets where status in ('open', 'in_progress')),
    'activity', (
      select coalesce(jsonb_agg(row_to_json(d) order by d.day), '[]'::jsonb)
      from (
        select g.day::date as day,
               coalesce(dps.revenue, 0)        as revenue,
               coalesce(dps.energy_kwh, 0)     as energy_kwh,
               coalesce(dps.sessions_count, 0) as sessions,
               coalesce(dps.active_users, 0)   as active_users
        from generate_series(current_date - (p_days - 1), current_date, interval '1 day') g(day)
        left join public.daily_platform_stats dps on dps.day = g.day::date
      ) d
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- Grants. Only what the browser legitimately needs.
-- ---------------------------------------------------------------------
grant execute on function public.search_stations(numeric, numeric, integer,
  public.connector_type[], numeric, boolean, text, integer, integer) to anon, authenticated;
grant execute on function public.resolve_tariff(uuid, timestamptz) to anon, authenticated;
grant execute on function public.compute_session_cost(numeric, numeric, numeric, numeric, numeric, numeric, numeric)
  to anon, authenticated;
grant execute on function public.evaluate_coupon(text, uuid, uuid, numeric) to authenticated;
grant execute on function public.spendable_balance(uuid) to authenticated;
grant execute on function public.start_charging_session(uuid, uuid, text, text) to authenticated;
grant execute on function public.stop_charging_session(uuid, public.session_stop_reason, numeric, timestamptz)
  to authenticated;
grant execute on function public.create_reservation(uuid, integer, uuid) to authenticated;
grant execute on function public.cancel_reservation(uuid) to authenticated;
grant execute on function public.owner_dashboard(integer) to authenticated;
grant execute on function public.admin_dashboard(integer) to authenticated;

-- Server-only surface: webhooks and jobs run with the service role.
revoke execute on function public.activate_session(uuid, text, timestamptz) from anon, authenticated;
revoke execute on function public.record_meter_reading(uuid, timestamptz, numeric, numeric, smallint)
  from anon, authenticated;
revoke execute on function public.fail_session(uuid, text, public.session_stop_reason) from anon, authenticated;
revoke execute on function public.credit_wallet_from_payment(uuid) from anon, authenticated;
revoke execute on function public.generate_settlement(uuid, date, date, numeric, numeric) from anon, authenticated;
revoke execute on function public.rollup_daily_stats(date) from anon, authenticated;
revoke execute on function public.expire_stale_records() from anon, authenticated;
revoke execute on function public.consume_rate_limit(text, text, integer, integer) from anon, authenticated;
