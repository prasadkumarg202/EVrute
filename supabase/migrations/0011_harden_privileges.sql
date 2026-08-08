-- =====================================================================
-- EVRute :: 0011 — Privilege hardening
-- =====================================================================
-- Postgres grants EXECUTE on every new function to PUBLIC by default, and
-- `anon`/`authenticated` inherit it. `REVOKE ... FROM anon` does NOT undo
-- a PUBLIC grant — you have to revoke from PUBLIC itself. Without this
-- migration every SECURITY DEFINER function, including the settlement
-- generator and the wallet crediter, is reachable unauthenticated at
-- /rest/v1/rpc/<name>.
--
-- Policy: deny by default, then grant the minimum each role needs.
-- =====================================================================

-- 1. Nothing in public is executable unless explicitly granted below.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon, authenticated;

-- Future functions inherit deny-by-default too.
alter default privileges in schema public revoke execute on functions from public;

-- 2. Functions that genuinely need no elevated rights become
--    SECURITY INVOKER, so RLS does the work instead of a definer bypass.
create or replace function public.resolve_tariff(
  p_connector_id uuid,
  p_at           timestamptz default now()
)
returns public.tariffs
language sql
stable
security invoker
set search_path = public, evr, extensions
as $$
  select t.*
  from public.connectors c
  join public.chargers ch on ch.id = c.charger_id
  join public.tariffs  t  on t.station_id = ch.station_id
                         and (t.connector_type is null or t.connector_type = c.type)
                         and t.effective_from <= p_at
                         and (t.effective_to is null or t.effective_to > p_at)
  where c.id = p_connector_id
  order by (t.connector_type is not null) desc, t.effective_from desc
  limit 1;
$$;

-- Balance is the caller's own; RLS on wallets already scopes it.
create or replace function public.my_spendable_balance()
returns numeric
language sql
stable
security invoker
set search_path = public, evr, extensions
as $$
  select greatest(w.balance - w.held_amount, 0)
  from public.wallets w
  where w.user_id = auth.uid();
$$;

-- 3. evaluate_coupon previously accepted p_user_id, which let any caller
--    probe another user's redemption history. The caller is now derived
--    from the JWT and the parameter is gone.
drop function if exists public.evaluate_coupon(text, uuid, uuid, numeric);

create or replace function public.evaluate_coupon(
  p_code       text,
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
  v_user uuid := auth.uid();
  c      public.coupons;
  v_uses int;
  v_disc numeric(12,2);
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
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
  where r.coupon_id = c.id and r.user_id = v_user;

  if v_uses >= c.max_uses_per_user then
    return query select null::uuid, 0::numeric, 'user_limit_reached'; return;
  end if;

  v_disc := case when c.discount_type = 'flat'
                 then c.value
                 else round(p_amount * c.value / 100.0, 2) end;

  if c.max_discount is not null then
    v_disc := least(v_disc, c.max_discount);
  end if;

  return query select c.id, least(v_disc, p_amount), 'ok';
end;
$$;

-- 4. The one function missing an explicit search_path.
create or replace function evr.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, evr, extensions
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 5. Explicit grants. Anything absent from this list is service_role only.

-- Public / unauthenticated: the map is the top of the funnel.
grant execute on function public.search_stations(numeric, numeric, integer,
  public.connector_type[], numeric, boolean, text, integer, integer) to anon, authenticated;
grant execute on function public.resolve_tariff(uuid, timestamptz) to anon, authenticated;
grant execute on function public.compute_session_cost(
  numeric, numeric, numeric, numeric, numeric, numeric, numeric) to anon, authenticated;

-- Signed-in customers.
grant execute on function public.my_spendable_balance() to authenticated;
grant execute on function public.evaluate_coupon(text, uuid, numeric) to authenticated;
grant execute on function public.start_charging_session(uuid, uuid, text, text) to authenticated;
grant execute on function public.stop_charging_session(
  uuid, public.session_stop_reason, numeric, timestamptz) to authenticated;
grant execute on function public.create_reservation(uuid, integer, uuid) to authenticated;
grant execute on function public.cancel_reservation(uuid) to authenticated;

-- Portals.
grant execute on function public.owner_dashboard(integer) to authenticated;
grant execute on function public.admin_dashboard(integer) to authenticated;

-- Server-only: webhooks, schedulers, settlement runs. service_role bypasses
-- RLS and holds these grants implicitly as table owner; no anon/authenticated
-- grant is issued, so /rest/v1/rpc/* rejects them with 404.
grant execute on function public.activate_session(uuid, text, timestamptz) to service_role;
grant execute on function public.record_meter_reading(
  uuid, timestamptz, numeric, numeric, smallint) to service_role;
grant execute on function public.fail_session(
  uuid, text, public.session_stop_reason) to service_role;
grant execute on function public.credit_wallet_from_payment(uuid) to service_role;
grant execute on function public.generate_settlement(uuid, date, date, numeric, numeric) to service_role;
grant execute on function public.rollup_daily_stats(date) to service_role;
grant execute on function public.expire_stale_records() to service_role;
grant execute on function public.consume_rate_limit(text, text, integer, integer) to service_role;

-- 6. Ops tables are not part of the client API surface at all.
revoke all on public.webhook_events from anon, authenticated;
revoke all on public.rate_limits    from anon, authenticated;

-- Read-only tables for clients: writes only ever happen through RPCs.
revoke insert, update, delete on public.sessions            from anon, authenticated;
revoke insert, update, delete on public.wallet_transactions from anon, authenticated;
revoke insert, update, delete on public.wallets             from anon, authenticated;
revoke insert, update, delete on public.wallet_holds        from anon, authenticated;
revoke insert, update, delete on public.payments            from anon, authenticated;
revoke insert, update, delete on public.invoices            from anon, authenticated;
revoke insert, update, delete on public.reservations        from anon, authenticated;
revoke insert, update, delete on public.meter_readings      from anon, authenticated;
revoke insert, update, delete on public.settlement_items    from anon, authenticated;
revoke insert, delete         on public.settlements         from anon, authenticated;
revoke all on public.audit_log            from anon, authenticated;
revoke all on public.daily_station_stats  from anon, authenticated;
revoke all on public.daily_platform_stats from anon, authenticated;
grant select on public.daily_station_stats, public.daily_platform_stats to authenticated;
grant select on public.audit_log to authenticated;
