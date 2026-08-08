-- =====================================================================
-- EVRute :: 0004 — Charging lifecycle: reservations, sessions, meter values
-- =====================================================================

create table public.reservations (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles (id) on delete cascade,
  connector_id         uuid not null references public.connectors (id) on delete cascade,
  vehicle_id           uuid references public.vehicles (id) on delete set null,
  provider_reservation_ref text unique,
  starts_at            timestamptz not null,
  expires_at           timestamptz not null,
  status               public.reservation_status not null default 'pending',
  fee                  numeric(8,2) not null default 0 check (fee >= 0),
  cancelled_reason     text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint reservations_window_valid check (expires_at > starts_at),
  constraint reservations_window_sane  check (expires_at <= starts_at + interval '2 hours')
);

create index reservations_user_idx      on public.reservations (user_id, created_at desc);
create index reservations_connector_idx on public.reservations (connector_id);
create index reservations_expiry_idx    on public.reservations (expires_at)
  where status in ('pending', 'active');

-- A connector can hold at most one live reservation for any instant.
-- Enforced by the database, not by a read-then-write in application code.
alter table public.reservations
  add constraint reservations_no_double_booking
  exclude using gist (
    connector_id with =,
    tstzrange(starts_at, expires_at, '[)') with &&
  ) where (status in ('pending', 'active'));

create trigger reservations_touch before update on public.reservations
  for each row execute function evr.touch_updated_at();

-- ---------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------
create table public.sessions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles (id) on delete restrict,
  vehicle_id           uuid references public.vehicles (id) on delete set null,
  connector_id         uuid not null references public.connectors (id) on delete restrict,
  station_id           uuid not null references public.stations (id) on delete restrict,
  reservation_id       uuid references public.reservations (id) on delete set null,
  tariff_id            uuid references public.tariffs (id) on delete set null,
  provider_session_ref text unique,
  idempotency_key      text not null unique,
  status               public.session_status not null default 'pending',
  stop_reason          public.session_stop_reason,
  requested_at         timestamptz not null default now(),
  started_at           timestamptz,
  stopped_at           timestamptz,
  energy_kwh           numeric(12,3) not null default 0 check (energy_kwh >= 0),
  duration_seconds     integer not null default 0 check (duration_seconds >= 0),
  -- Pricing snapshot: copied from the tariff at start so a later tariff
  -- change can never retroactively alter a closed session's invoice.
  price_per_kwh        numeric(8,2) not null default 0 check (price_per_kwh >= 0),
  session_fee          numeric(8,2) not null default 0 check (session_fee >= 0),
  idle_fee_per_min     numeric(8,2) not null default 0 check (idle_fee_per_min >= 0),
  tax_pct              numeric(5,2) not null default 0 check (tax_pct >= 0),
  energy_cost          numeric(12,2) not null default 0 check (energy_cost >= 0),
  idle_cost            numeric(12,2) not null default 0 check (idle_cost >= 0),
  subtotal             numeric(12,2) not null default 0 check (subtotal >= 0),
  tax_amount           numeric(12,2) not null default 0 check (tax_amount >= 0),
  discount_amount      numeric(12,2) not null default 0 check (discount_amount >= 0),
  total_cost           numeric(12,2) not null default 0 check (total_cost >= 0),
  coupon_id            uuid,
  last_meter_at        timestamptz,
  soc_start_pct        smallint check (soc_start_pct between 0 and 100),
  soc_end_pct          smallint check (soc_end_pct between 0 and 100),
  failure_message      text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint sessions_times_ordered check (stopped_at is null or started_at is null or stopped_at >= started_at),
  constraint sessions_terminal_has_stop check (
    status not in ('completed', 'failed', 'cancelled') or stopped_at is not null
  )
);

create index sessions_user_idx      on public.sessions (user_id, created_at desc);
create index sessions_station_idx   on public.sessions (station_id, created_at desc);
create index sessions_connector_idx on public.sessions (connector_id, created_at desc);
create index sessions_status_idx    on public.sessions (status) where status in ('pending', 'active');
create index sessions_started_idx   on public.sessions (started_at desc) where started_at is not null;

-- At most one live session per connector. The partial unique index is the
-- hard guarantee behind "connector is busy" — no application-level lock
-- can be trusted across concurrent requests.
create unique index sessions_one_live_per_connector_idx
  on public.sessions (connector_id) where (status in ('pending', 'active'));

-- ...and at most one live session per user, so a user cannot start two
-- charges and overdraw a single wallet.
create unique index sessions_one_live_per_user_idx
  on public.sessions (user_id) where (status in ('pending', 'active'));

create trigger sessions_touch before update on public.sessions
  for each row execute function evr.touch_updated_at();

-- ---------------------------------------------------------------------
-- Meter values — append-only stream from provider MeterValues webhooks.
-- High write volume, read almost exclusively as "latest N for a session",
-- so we index by (session_id, recorded_at desc) and nothing else.
-- ---------------------------------------------------------------------
create table public.meter_readings (
  id          bigint generated always as identity primary key,
  session_id  uuid not null references public.sessions (id) on delete cascade,
  recorded_at timestamptz not null,
  energy_kwh  numeric(12,3) not null check (energy_kwh >= 0),
  power_kw    numeric(8,2)  check (power_kw >= 0),
  voltage     numeric(8,2)  check (voltage >= 0),
  current_a   numeric(8,2)  check (current_a >= 0),
  soc_pct     smallint check (soc_pct between 0 and 100),
  created_at  timestamptz not null default now(),
  unique (session_id, recorded_at)
);

create index meter_readings_session_idx
  on public.meter_readings (session_id, recorded_at desc);

-- ---------------------------------------------------------------------
-- Cost calculation — one function, used by the stop path, the webhook
-- path and the tests. There is no second implementation to drift from.
-- ---------------------------------------------------------------------
create or replace function public.compute_session_cost(
  p_energy_kwh    numeric,
  p_price_per_kwh numeric,
  p_session_fee   numeric,
  p_idle_minutes  numeric,
  p_idle_fee_per_min numeric,
  p_tax_pct       numeric,
  p_discount      numeric default 0
)
returns table (
  energy_cost     numeric,
  idle_cost       numeric,
  subtotal        numeric,
  tax_amount      numeric,
  discount_amount numeric,
  total_cost      numeric
)
language plpgsql
immutable
as $$
declare
  v_energy   numeric(12,2);
  v_idle     numeric(12,2);
  v_gross    numeric(12,2);
  v_discount numeric(12,2);
  v_net      numeric(12,2);
  v_tax      numeric(12,2);
begin
  v_energy   := round(coalesce(p_energy_kwh, 0) * coalesce(p_price_per_kwh, 0), 2);
  v_idle     := round(greatest(coalesce(p_idle_minutes, 0), 0) * coalesce(p_idle_fee_per_min, 0), 2);
  v_gross    := round(v_energy + v_idle + coalesce(p_session_fee, 0), 2);
  -- A discount can never exceed the bill, and never produces a credit.
  v_discount := least(round(greatest(coalesce(p_discount, 0), 0), 2), v_gross);
  v_net      := v_gross - v_discount;
  v_tax      := round(v_net * coalesce(p_tax_pct, 0) / 100.0, 2);

  return query select v_energy, v_idle, v_gross, v_tax, v_discount, round(v_net + v_tax, 2);
end;
$$;
