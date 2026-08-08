-- =====================================================================
-- EVRute :: 0006 — Settlement engine
-- =====================================================================
-- A settlement aggregates completed sessions for one owner over one
-- period. settlement_items give a line-level audit trail so an owner can
-- reconcile a payout down to the individual session.
--
-- Money split (Indian CPO norms):
--   gross      = sum of session subtotals (pre-GST energy + fees)
--   commission = gross * station.commission_pct
--   gst        = GST on the platform's commission (the platform's service)
--   tds        = TDS withheld on the payout under 194-O where applicable
--   net        = gross - commission - gst - tds
-- =====================================================================

create table public.settlements (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.profiles (id) on delete restrict,
  period_start      date not null,
  period_end        date not null,
  sessions_count    integer not null default 0 check (sessions_count >= 0),
  energy_kwh        numeric(14,3) not null default 0 check (energy_kwh >= 0),
  gross_amount      numeric(14,2) not null default 0 check (gross_amount >= 0),
  commission_pct    numeric(5,2)  not null default 0 check (commission_pct >= 0 and commission_pct <= 100),
  commission_amount numeric(14,2) not null default 0 check (commission_amount >= 0),
  gst_amount        numeric(14,2) not null default 0 check (gst_amount >= 0),
  tds_amount        numeric(14,2) not null default 0 check (tds_amount >= 0),
  net_amount        numeric(14,2) not null default 0,
  currency          char(3) not null default 'INR',
  status            public.settlement_status not null default 'pending',
  payout_reference  text,
  approved_by       uuid references public.profiles (id) on delete set null,
  approved_at       timestamptz,
  paid_at           timestamptz,
  failure_reason    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint settlements_period_valid check (period_end >= period_start),
  constraint settlements_net_consistent check (
    net_amount = gross_amount - commission_amount - gst_amount - tds_amount
  ),
  -- One settlement per owner per period. Re-running the job is a no-op
  -- rather than a duplicate payout.
  unique (owner_id, period_start, period_end)
);

create index settlements_owner_idx  on public.settlements (owner_id, period_start desc);
create index settlements_status_idx on public.settlements (status);

create trigger settlements_touch before update on public.settlements
  for each row execute function evr.touch_updated_at();

create table public.settlement_items (
  id             uuid primary key default gen_random_uuid(),
  settlement_id  uuid not null references public.settlements (id) on delete cascade,
  session_id     uuid not null references public.sessions (id) on delete restrict,
  station_id     uuid not null references public.stations (id) on delete restrict,
  energy_kwh     numeric(12,3) not null check (energy_kwh >= 0),
  gross_amount   numeric(12,2) not null check (gross_amount >= 0),
  commission_amount numeric(12,2) not null check (commission_amount >= 0),
  net_amount     numeric(12,2) not null,
  created_at     timestamptz not null default now(),
  -- A session can only ever appear in one settlement. This is the
  -- structural guarantee against paying an owner twice for one charge.
  unique (session_id)
);

create index settlement_items_settlement_idx on public.settlement_items (settlement_id);
create index settlement_items_station_idx    on public.settlement_items (station_id);

-- ---------------------------------------------------------------------
-- Settlement generation. Idempotent: sessions already settled are
-- excluded by the unique(session_id) constraint on settlement_items, and
-- the settlement row itself is unique per (owner, period).
-- ---------------------------------------------------------------------
create or replace function public.generate_settlement(
  p_owner_id     uuid,
  p_period_start date,
  p_period_end   date,
  p_gst_pct      numeric default 18.00,
  p_tds_pct      numeric default 1.00
)
returns public.settlements
language plpgsql
security definer
set search_path = public, evr, extensions
as $$
declare
  v_settlement public.settlements;
begin
  if p_period_end < p_period_start then
    raise exception 'period_end must not precede period_start';
  end if;

  insert into public.settlements (owner_id, period_start, period_end, status)
  values (p_owner_id, p_period_start, p_period_end, 'pending')
  on conflict (owner_id, period_start, period_end) do update
    set updated_at = now()
  returning * into v_settlement;

  if v_settlement.status <> 'pending' then
    -- Already approved/paid: never mutate a settled payout.
    return v_settlement;
  end if;

  -- Clear and rebuild the line items for a still-pending settlement.
  delete from public.settlement_items where settlement_id = v_settlement.id;

  insert into public.settlement_items (
    settlement_id, session_id, station_id, energy_kwh,
    gross_amount, commission_amount, net_amount
  )
  select
    v_settlement.id,
    s.id,
    s.station_id,
    s.energy_kwh,
    s.subtotal,
    round(s.subtotal * st.commission_pct / 100.0, 2),
    s.subtotal - round(s.subtotal * st.commission_pct / 100.0, 2)
  from public.sessions s
  join public.stations st on st.id = s.station_id
  where st.owner_id = p_owner_id
    and s.status = 'completed'
    and s.stopped_at >= p_period_start::timestamptz
    and s.stopped_at <  (p_period_end + 1)::timestamptz
  on conflict (session_id) do nothing;

  update public.settlements s
  set sessions_count    = agg.cnt,
      energy_kwh        = agg.kwh,
      gross_amount      = agg.gross,
      commission_pct    = case when agg.gross > 0
                               then round(agg.commission * 100.0 / agg.gross, 2)
                               else 0 end,
      commission_amount = agg.commission,
      gst_amount        = round(agg.commission * p_gst_pct / 100.0, 2),
      tds_amount        = round(agg.gross * p_tds_pct / 100.0, 2),
      net_amount        = agg.gross
                          - agg.commission
                          - round(agg.commission * p_gst_pct / 100.0, 2)
                          - round(agg.gross * p_tds_pct / 100.0, 2),
      updated_at        = now()
  from (
    select
      count(*)::int                       as cnt,
      coalesce(sum(si.energy_kwh), 0)     as kwh,
      coalesce(sum(si.gross_amount), 0)   as gross,
      coalesce(sum(si.commission_amount), 0) as commission
    from public.settlement_items si
    where si.settlement_id = v_settlement.id
  ) agg
  where s.id = v_settlement.id
  returning s.* into v_settlement;

  return v_settlement;
end;
$$;

-- ---------------------------------------------------------------------
-- Audit log — every privileged state change lands here. Append-only.
-- ---------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_role  public.app_role,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  ip_address  inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, created_at desc);
create index audit_log_actor_idx  on public.audit_log (actor_id, created_at desc);

create trigger audit_log_no_update before update on public.audit_log
  for each row execute function evr.reject_ledger_mutation();
create trigger audit_log_no_delete before delete on public.audit_log
  for each row execute function evr.reject_ledger_mutation();
