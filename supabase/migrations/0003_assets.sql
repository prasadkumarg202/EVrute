-- =====================================================================
-- EVRute :: 0003 — Physical assets: stations, chargers, connectors, tariffs
-- =====================================================================
-- Hierarchy mirrors OCPP/OCPI: Station (site) -> Charger (EVSE) -> Connector.
-- provider_* columns are the identifiers on the headless OCPP provider
-- (ChargeLab / eDRV) side. They are the only coupling to the vendor and
-- are unique so a re-sync can never create duplicates.
-- =====================================================================

create table public.stations (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references public.profiles (id) on delete restrict,
  provider_station_id   text unique,
  name                  text not null check (length(btrim(name)) between 2 and 120),
  slug                  text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description           text,
  address_line1         text not null,
  address_line2         text,
  city                  text not null,
  state                 text not null,
  postal_code           text check (postal_code is null or postal_code ~ '^[0-9]{6}$'),
  country_code          char(2) not null default 'IN',
  lat                   numeric(9,6) not null check (lat between -90 and 90),
  lng                   numeric(9,6) not null check (lng between -180 and 180),
  -- Generated geography column: single source of truth for proximity search,
  -- always in sync with lat/lng, indexed with GIST for ST_DWithin.
  geo                   extensions.geography(Point, 4326)
                        generated always as (
                          extensions.st_setsrid(
                            extensions.st_makepoint(lng::float8, lat::float8), 4326
                          )::extensions.geography
                        ) stored,
  amenities             text[] not null default '{}',
  photos                text[] not null default '{}',
  open_time             time,
  close_time            time,
  is_24x7               boolean not null default true,
  status                public.station_status not null default 'draft',
  commission_pct        numeric(5,2) not null default 10.00
                        check (commission_pct >= 0 and commission_pct <= 100),
  settlement_cycle_days smallint not null default 7
                        check (settlement_cycle_days in (1, 7, 15, 30)),
  rating_avg            numeric(3,2) not null default 0 check (rating_avg between 0 and 5),
  rating_count          integer not null default 0 check (rating_count >= 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint stations_hours_valid check (is_24x7 or (open_time is not null and close_time is not null))
);

create index stations_geo_idx        on public.stations using gist (geo);
create index stations_owner_idx      on public.stations (owner_id);
create index stations_status_idx     on public.stations (status) where status = 'active';
create index stations_city_idx       on public.stations (lower(city));
create index stations_name_trgm_idx  on public.stations using gin (name extensions.gin_trgm_ops);
create index stations_created_at_idx on public.stations (created_at desc);

create trigger stations_touch before update on public.stations
  for each row execute function evr.touch_updated_at();

-- ---------------------------------------------------------------------
-- Chargers (EVSE)
-- ---------------------------------------------------------------------
create table public.chargers (
  id                  uuid primary key default gen_random_uuid(),
  station_id          uuid not null references public.stations (id) on delete cascade,
  provider_charger_id text unique,
  label               text not null,
  vendor              text,
  model               text,
  serial_number       text,
  power_kw            numeric(6,2) not null check (power_kw > 0 and power_kw <= 1000),
  ocpp_version        text not null default '1.6J' check (ocpp_version in ('1.6J', '2.0.1')),
  firmware_version    text,
  status              public.charger_status not null default 'offline',
  last_heartbeat_at   timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (station_id, label)
);

create index chargers_station_idx on public.chargers (station_id);
create index chargers_status_idx  on public.chargers (status);

create trigger chargers_touch before update on public.chargers
  for each row execute function evr.touch_updated_at();

-- ---------------------------------------------------------------------
-- Connectors
-- ---------------------------------------------------------------------
create table public.connectors (
  id                    uuid primary key default gen_random_uuid(),
  charger_id            uuid not null references public.chargers (id) on delete cascade,
  provider_connector_id text unique,
  connector_number      smallint not null check (connector_number > 0),
  type                  public.connector_type not null,
  current_type          public.current_type not null,
  power_kw              numeric(6,2) not null check (power_kw > 0 and power_kw <= 1000),
  status                public.connector_status not null default 'offline',
  status_changed_at     timestamptz not null default now(),
  last_error_code       text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (charger_id, connector_number)
);

create index connectors_charger_idx on public.connectors (charger_id);
create index connectors_status_idx  on public.connectors (status);
create index connectors_type_idx    on public.connectors (type);

create trigger connectors_touch before update on public.connectors
  for each row execute function evr.touch_updated_at();

-- Stamp status_changed_at only when status actually changes, so "how long
-- has this connector been offline" is answerable without an event scan.
create or replace function evr.connectors_stamp_status_change()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger connectors_stamp_status before update on public.connectors
  for each row execute function evr.connectors_stamp_status_change();

-- ---------------------------------------------------------------------
-- Denormalised station_id on connectors is deliberately avoided; instead a
-- view flattens the hierarchy for the map/search read path.
-- ---------------------------------------------------------------------
create view public.connector_details
with (security_invoker = true) as
select
  c.id                as connector_id,
  c.connector_number,
  c.type,
  c.current_type,
  c.power_kw,
  c.status,
  c.status_changed_at,
  ch.id               as charger_id,
  ch.label            as charger_label,
  ch.status           as charger_status,
  ch.ocpp_version,
  s.id                as station_id,
  s.name              as station_name,
  s.owner_id,
  s.status            as station_status,
  s.city,
  s.lat,
  s.lng
from public.connectors c
join public.chargers   ch on ch.id = c.charger_id
join public.stations   s  on s.id = ch.station_id;

-- ---------------------------------------------------------------------
-- Tariffs — versioned pricing. Never UPDATE a live tariff; insert a new
-- row with a later effective_from. History stays intact for invoice
-- reconstruction and disputes.
-- ---------------------------------------------------------------------
create table public.tariffs (
  id                uuid primary key default gen_random_uuid(),
  station_id        uuid not null references public.stations (id) on delete cascade,
  connector_type    public.connector_type,  -- null = applies to all connector types
  price_per_kwh     numeric(8,2) not null check (price_per_kwh >= 0 and price_per_kwh <= 1000),
  session_fee       numeric(8,2) not null default 0 check (session_fee >= 0),
  idle_fee_per_min  numeric(8,2) not null default 0 check (idle_fee_per_min >= 0),
  min_balance_to_start numeric(8,2) not null default 100 check (min_balance_to_start >= 0),
  tax_pct           numeric(5,2) not null default 18.00 check (tax_pct >= 0 and tax_pct <= 100),
  effective_from    timestamptz not null default now(),
  effective_to      timestamptz,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  constraint tariffs_window_valid check (effective_to is null or effective_to > effective_from)
);

create index tariffs_lookup_idx
  on public.tariffs (station_id, connector_type, effective_from desc);

-- No two tariffs for the same station+connector_type may have overlapping
-- validity windows. btree_gist lets us mix equality and range in one
-- exclusion constraint — this is the guard that makes pricing unambiguous.
--
-- Split into two partial constraints because `connector_type::text` is only
-- STABLE (enum labels can be renamed), so it cannot appear in an index
-- expression. Equality on the enum itself uses gist_enum_ops and is exact;
-- NULL never equals NULL under `=`, hence the separate catch-all constraint.
alter table public.tariffs
  add constraint tariffs_no_overlap_typed
  exclude using gist (
    station_id with =,
    connector_type with =,
    tstzrange(effective_from, effective_to, '[)') with &&
  ) where (connector_type is not null);

alter table public.tariffs
  add constraint tariffs_no_overlap_default
  exclude using gist (
    station_id with =,
    tstzrange(effective_from, effective_to, '[)') with &&
  ) where (connector_type is null);

-- Resolve the tariff in force for a connector at a point in time.
-- Connector-type-specific rows win over the catch-all row.
create or replace function public.resolve_tariff(
  p_connector_id uuid,
  p_at           timestamptz default now()
)
returns public.tariffs
language sql
stable
security definer
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
