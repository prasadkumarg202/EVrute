-- =====================================================================
-- EVRute :: 0008 — Webhook idempotency, rate limits, analytics rollups
-- =====================================================================

-- Every inbound webhook is recorded before it is processed. The unique
-- (source, event_id) is what makes redelivery a no-op instead of a
-- double-credit. Providers WILL redeliver; this is not optional.
create table public.webhook_events (
  id            uuid primary key default gen_random_uuid(),
  source        text not null check (source in ('charging_provider', 'razorpay', 'cashfree')),
  event_id      text not null,
  event_type    text not null,
  payload       jsonb not null,
  signature     text,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  attempts      smallint not null default 0 check (attempts >= 0),
  last_error    text,
  unique (source, event_id)
);

create index webhook_events_unprocessed_idx
  on public.webhook_events (received_at) where processed_at is null;
create index webhook_events_type_idx on public.webhook_events (source, event_type, received_at desc);

-- Coarse rate limiting for OTP requests and other abuse-prone endpoints.
-- Fixed window keyed on (bucket, identifier); cheap and good enough.
create table public.rate_limits (
  bucket       text not null,
  identifier   text not null,
  window_start timestamptz not null,
  count        integer not null default 0 check (count >= 0),
  primary key (bucket, identifier, window_start)
);

create index rate_limits_gc_idx on public.rate_limits (window_start);

create or replace function public.consume_rate_limit(
  p_bucket      text,
  p_identifier  text,
  p_limit       integer,
  p_window_secs integer
)
returns boolean
language plpgsql
security definer
set search_path = public, evr, extensions
as $$
declare
  v_window timestamptz;
  v_count  integer;
begin
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_secs) * p_window_secs);

  insert into public.rate_limits (bucket, identifier, window_start, count)
  values (p_bucket, p_identifier, v_window, 1)
  on conflict (bucket, identifier, window_start)
    do update set count = public.rate_limits.count + 1
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

-- ---------------------------------------------------------------------
-- Analytics rollups. Deliberately NOT materialized views: those lock on
-- refresh. These are plain tables upserted by a scheduled job, so reads
-- are never blocked by a refresh and a backfill is a normal UPDATE.
-- ---------------------------------------------------------------------
create table public.daily_station_stats (
  station_id     uuid not null references public.stations (id) on delete cascade,
  day            date not null,
  sessions_count integer not null default 0,
  energy_kwh     numeric(14,3) not null default 0,
  revenue        numeric(14,2) not null default 0,
  unique_users   integer not null default 0,
  failed_count   integer not null default 0,
  avg_duration_seconds integer not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (station_id, day)
);

create index daily_station_stats_day_idx on public.daily_station_stats (day desc);

create table public.daily_platform_stats (
  day             date primary key,
  active_users    integer not null default 0,
  new_users       integer not null default 0,
  sessions_count  integer not null default 0,
  energy_kwh      numeric(14,3) not null default 0,
  revenue         numeric(14,2) not null default 0,
  wallet_recharged numeric(14,2) not null default 0,
  updated_at      timestamptz not null default now()
);

-- Recompute a single day. Idempotent, so the scheduler can re-run it for
-- late-arriving MeterValues without producing double counts.
create or replace function public.rollup_daily_stats(p_day date default (current_date - 1))
returns void
language plpgsql
security definer
set search_path = public, evr, extensions
as $$
begin
  insert into public.daily_station_stats as d (
    station_id, day, sessions_count, energy_kwh, revenue,
    unique_users, failed_count, avg_duration_seconds, updated_at
  )
  select
    s.station_id,
    p_day,
    count(*) filter (where s.status = 'completed'),
    coalesce(sum(s.energy_kwh) filter (where s.status = 'completed'), 0),
    coalesce(sum(s.total_cost) filter (where s.status = 'completed'), 0),
    count(distinct s.user_id) filter (where s.status = 'completed'),
    count(*) filter (where s.status = 'failed'),
    coalesce(avg(s.duration_seconds) filter (where s.status = 'completed'), 0)::int,
    now()
  from public.sessions s
  where s.stopped_at >= p_day::timestamptz
    and s.stopped_at <  (p_day + 1)::timestamptz
  group by s.station_id
  on conflict (station_id, day) do update set
    sessions_count = excluded.sessions_count,
    energy_kwh     = excluded.energy_kwh,
    revenue        = excluded.revenue,
    unique_users   = excluded.unique_users,
    failed_count   = excluded.failed_count,
    avg_duration_seconds = excluded.avg_duration_seconds,
    updated_at     = now();

  insert into public.daily_platform_stats as p (
    day, active_users, new_users, sessions_count, energy_kwh,
    revenue, wallet_recharged, updated_at
  )
  values (
    p_day,
    (select count(distinct s.user_id) from public.sessions s
      where s.stopped_at >= p_day::timestamptz and s.stopped_at < (p_day + 1)::timestamptz),
    (select count(*) from public.profiles pr
      where pr.created_at >= p_day::timestamptz and pr.created_at < (p_day + 1)::timestamptz),
    (select count(*) from public.sessions s
      where s.status = 'completed'
        and s.stopped_at >= p_day::timestamptz and s.stopped_at < (p_day + 1)::timestamptz),
    (select coalesce(sum(s.energy_kwh), 0) from public.sessions s
      where s.status = 'completed'
        and s.stopped_at >= p_day::timestamptz and s.stopped_at < (p_day + 1)::timestamptz),
    (select coalesce(sum(s.total_cost), 0) from public.sessions s
      where s.status = 'completed'
        and s.stopped_at >= p_day::timestamptz and s.stopped_at < (p_day + 1)::timestamptz),
    (select coalesce(sum(pm.amount), 0) from public.payments pm
      where pm.status = 'captured'
        and pm.captured_at >= p_day::timestamptz and pm.captured_at < (p_day + 1)::timestamptz),
    now()
  )
  on conflict (day) do update set
    active_users     = excluded.active_users,
    new_users        = excluded.new_users,
    sessions_count   = excluded.sessions_count,
    energy_kwh       = excluded.energy_kwh,
    revenue          = excluded.revenue,
    wallet_recharged = excluded.wallet_recharged,
    updated_at       = now();
end;
$$;
