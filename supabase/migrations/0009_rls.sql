-- =====================================================================
-- EVRute :: 0009 — Row Level Security
-- =====================================================================
-- Model:
--   customer — sees only their own rows, plus public station data
--   owner    — additionally sees everything scoped to stations they own
--   admin    — sees everything
--   employee — read-only admin (support desk)
--
-- Every policy calls the role helper as `(select evr.current_role())`.
-- Wrapping it in a scalar subquery makes Postgres evaluate it ONCE per
-- statement as an InitPlan instead of once per row — the difference
-- between a 4 ms and a 400 ms list query at scale.
-- =====================================================================

create or replace function evr.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public, evr, extensions
as $$
  select coalesce(
    (select p.role from public.profiles p where p.id = auth.uid()),
    'customer'::public.app_role
  );
$$;

create or replace function evr.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, evr, extensions
as $$
  select evr.current_role() in ('admin', 'employee');
$$;

create or replace function evr.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, evr, extensions
as $$
  select evr.current_role() = 'admin';
$$;

-- Does the current user own this station?
create or replace function evr.owns_station(p_station_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, evr, extensions
as $$
  select exists (
    select 1 from public.stations s
    where s.id = p_station_id and s.owner_id = auth.uid()
  );
$$;

grant execute on function evr.current_role(), evr.is_staff(), evr.is_admin(),
                          evr.owns_station(uuid)
  to authenticated, anon;

-- ---------------------------------------------------------------------
-- Privilege-escalation guard: only an admin may change a role, and no
-- one may promote themselves. RLS alone cannot express "this column is
-- immutable for you", so it lives in a trigger.
-- ---------------------------------------------------------------------
create or replace function evr.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public, evr, extensions
as $$
begin
  if new.role is distinct from old.role then
    if not evr.is_admin() then
      raise exception 'only an administrator may change a user role'
        using errcode = 'insufficient_privilege';
    end if;
    if new.id = auth.uid() then
      raise exception 'you cannot change your own role'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role before update on public.profiles
  for each row execute function evr.guard_profile_role();

-- ---------------------------------------------------------------------
-- Enable RLS everywhere. Tables with no policy are deny-all by design
-- (service_role bypasses RLS and is the only writer for those).
-- ---------------------------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.vehicles             enable row level security;
alter table public.stations             enable row level security;
alter table public.chargers             enable row level security;
alter table public.connectors           enable row level security;
alter table public.tariffs              enable row level security;
alter table public.reservations         enable row level security;
alter table public.sessions             enable row level security;
alter table public.meter_readings       enable row level security;
alter table public.wallets              enable row level security;
alter table public.wallet_transactions  enable row level security;
alter table public.wallet_holds         enable row level security;
alter table public.payments             enable row level security;
alter table public.invoices             enable row level security;
alter table public.settlements          enable row level security;
alter table public.settlement_items     enable row level security;
alter table public.favorites            enable row level security;
alter table public.reviews              enable row level security;
alter table public.coupons              enable row level security;
alter table public.coupon_redemptions   enable row level security;
alter table public.notifications        enable row level security;
alter table public.push_tokens          enable row level security;
alter table public.tickets              enable row level security;
alter table public.ticket_messages      enable row level security;
alter table public.audit_log            enable row level security;
alter table public.webhook_events       enable row level security;
alter table public.rate_limits          enable row level security;
alter table public.daily_station_stats  enable row level security;
alter table public.daily_platform_stats enable row level security;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select evr.is_staff()));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select evr.is_admin()))
  with check (id = (select auth.uid()) or (select evr.is_admin()));

-- ---------------------------------------------------------------------
-- vehicles
-- ---------------------------------------------------------------------
create policy vehicles_owner_all on public.vehicles
  for all to authenticated
  using (user_id = (select auth.uid()) or (select evr.is_staff()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- stations / chargers / connectors / tariffs
-- Public (including anonymous) read of active stations powers the map
-- without forcing a login — this is the top of the acquisition funnel.
-- ---------------------------------------------------------------------
create policy stations_public_read on public.stations
  for select to anon, authenticated
  using (status = 'active' or owner_id = (select auth.uid()) or (select evr.is_staff()));

create policy stations_owner_insert on public.stations
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select evr.current_role()) in ('owner', 'admin'));

create policy stations_owner_update on public.stations
  for update to authenticated
  using (owner_id = (select auth.uid()) or (select evr.is_admin()))
  with check (owner_id = (select auth.uid()) or (select evr.is_admin()));

create policy stations_admin_delete on public.stations
  for delete to authenticated
  using ((select evr.is_admin()));

create policy chargers_read on public.chargers
  for select to anon, authenticated
  using (exists (
    select 1 from public.stations s where s.id = chargers.station_id
      and (s.status = 'active' or s.owner_id = (select auth.uid()))
  ) or (select evr.is_staff()));

create policy chargers_write on public.chargers
  for all to authenticated
  using ((select evr.owns_station(station_id)) or (select evr.is_admin()))
  with check ((select evr.owns_station(station_id)) or (select evr.is_admin()));

create policy connectors_read on public.connectors
  for select to anon, authenticated
  using (exists (
    select 1 from public.chargers ch
    join public.stations s on s.id = ch.station_id
    where ch.id = connectors.charger_id
      and (s.status = 'active' or s.owner_id = (select auth.uid()))
  ) or (select evr.is_staff()));

create policy connectors_write on public.connectors
  for all to authenticated
  using (exists (
    select 1 from public.chargers ch
    where ch.id = connectors.charger_id and (select evr.owns_station(ch.station_id))
  ) or (select evr.is_admin()))
  with check (exists (
    select 1 from public.chargers ch
    where ch.id = connectors.charger_id and (select evr.owns_station(ch.station_id))
  ) or (select evr.is_admin()));

create policy tariffs_read on public.tariffs
  for select to anon, authenticated
  using (exists (
    select 1 from public.stations s where s.id = tariffs.station_id
      and (s.status = 'active' or s.owner_id = (select auth.uid()))
  ) or (select evr.is_staff()));

create policy tariffs_write on public.tariffs
  for all to authenticated
  using ((select evr.owns_station(station_id)) or (select evr.is_admin()))
  with check ((select evr.owns_station(station_id)) or (select evr.is_admin()));

-- ---------------------------------------------------------------------
-- reservations & sessions
-- Writes go exclusively through SECURITY DEFINER RPCs (0010) so that the
-- wallet guard, connector lock and provider call cannot be bypassed by a
-- direct PostgREST insert. Hence read-only policies here.
-- ---------------------------------------------------------------------
create policy reservations_read on public.reservations
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select evr.is_staff())
    or exists (
      select 1 from public.connectors c
      join public.chargers ch on ch.id = c.charger_id
      where c.id = reservations.connector_id and (select evr.owns_station(ch.station_id))
    )
  );

create policy sessions_read on public.sessions
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select evr.owns_station(station_id))
    or (select evr.is_staff())
  );

create policy meter_readings_read on public.meter_readings
  for select to authenticated
  using (exists (
    select 1 from public.sessions s
    where s.id = meter_readings.session_id
      and (s.user_id = (select auth.uid())
           or (select evr.owns_station(s.station_id))
           or (select evr.is_staff()))
  ));

-- ---------------------------------------------------------------------
-- money — strictly read-only to end users; every mutation is an RPC.
-- ---------------------------------------------------------------------
create policy wallets_read on public.wallets
  for select to authenticated
  using (user_id = (select auth.uid()) or (select evr.is_staff()));

create policy wallet_tx_read on public.wallet_transactions
  for select to authenticated
  using (user_id = (select auth.uid()) or (select evr.is_staff()));

create policy wallet_holds_read on public.wallet_holds
  for select to authenticated
  using (user_id = (select auth.uid()) or (select evr.is_staff()));

create policy payments_read on public.payments
  for select to authenticated
  using (user_id = (select auth.uid()) or (select evr.is_staff()));

create policy invoices_read on public.invoices
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select evr.owns_station(station_id))
    or (select evr.is_staff())
  );

create policy settlements_read on public.settlements
  for select to authenticated
  using (owner_id = (select auth.uid()) or (select evr.is_staff()));

create policy settlements_admin_write on public.settlements
  for update to authenticated
  using ((select evr.is_admin()))
  with check ((select evr.is_admin()));

create policy settlement_items_read on public.settlement_items
  for select to authenticated
  using (exists (
    select 1 from public.settlements st
    where st.id = settlement_items.settlement_id
      and (st.owner_id = (select auth.uid()) or (select evr.is_staff()))
  ));

-- ---------------------------------------------------------------------
-- engagement
-- ---------------------------------------------------------------------
create policy favorites_own on public.favorites
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy reviews_public_read on public.reviews
  for select to anon, authenticated
  using (true);

-- A review may only be written by someone who actually charged there.
create policy reviews_insert_verified on public.reviews
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.sessions s
      where s.user_id = (select auth.uid())
        and s.station_id = reviews.station_id
        and s.status = 'completed'
    )
  );

create policy reviews_update_own on public.reviews
  for update to authenticated
  using (user_id = (select auth.uid()) or (select evr.owns_station(station_id)) or (select evr.is_admin()))
  with check (user_id = (select auth.uid()) or (select evr.owns_station(station_id)) or (select evr.is_admin()));

create policy reviews_delete_own on public.reviews
  for delete to authenticated
  using (user_id = (select auth.uid()) or (select evr.is_admin()));

create policy coupons_public_read on public.coupons
  for select to anon, authenticated
  using ((is_active and valid_to > now()) or (select evr.is_staff()));

create policy coupons_admin_write on public.coupons
  for all to authenticated
  using ((select evr.is_admin()) or (station_id is not null and (select evr.owns_station(station_id))))
  with check ((select evr.is_admin()) or (station_id is not null and (select evr.owns_station(station_id))));

create policy coupon_redemptions_read on public.coupon_redemptions
  for select to authenticated
  using (user_id = (select auth.uid()) or (select evr.is_staff()));

create policy notifications_read on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_mark_read on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy push_tokens_own on public.push_tokens
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy tickets_read on public.tickets
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or assigned_to = (select auth.uid())
    or (station_id is not null and (select evr.owns_station(station_id)))
    or (select evr.is_staff())
  );

create policy tickets_insert_own on public.tickets
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy tickets_update_staff on public.tickets
  for update to authenticated
  using ((select evr.is_staff()) or user_id = (select auth.uid()))
  with check ((select evr.is_staff()) or user_id = (select auth.uid()));

create policy ticket_messages_read on public.ticket_messages
  for select to authenticated
  using (
    (not is_internal or (select evr.is_staff()))
    and exists (
      select 1 from public.tickets t
      where t.id = ticket_messages.ticket_id
        and (t.user_id = (select auth.uid())
             or t.assigned_to = (select auth.uid())
             or (select evr.is_staff()))
    )
  );

create policy ticket_messages_insert on public.ticket_messages
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (not is_internal or (select evr.is_staff()))
    and exists (
      select 1 from public.tickets t
      where t.id = ticket_messages.ticket_id
        and (t.user_id = (select auth.uid()) or (select evr.is_staff()))
    )
  );

-- ---------------------------------------------------------------------
-- analytics — owners see their own stations, staff see everything.
-- ---------------------------------------------------------------------
create policy daily_station_stats_read on public.daily_station_stats
  for select to authenticated
  using ((select evr.owns_station(station_id)) or (select evr.is_staff()));

create policy daily_platform_stats_read on public.daily_platform_stats
  for select to authenticated
  using ((select evr.is_staff()));

create policy audit_log_read on public.audit_log
  for select to authenticated
  using ((select evr.is_admin()));

-- webhook_events and rate_limits intentionally have NO policies:
-- unreachable from anon/authenticated, service_role only.
