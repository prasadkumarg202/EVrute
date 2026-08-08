-- =====================================================================
-- EVRute :: 0020 — Third-party stations (discovery only)
-- =====================================================================
-- WHY THIS EXISTS
-- A charging app with five stations is not useful. Real coverage has to
-- come from somewhere before EVRute has its own network, so we import
-- open-licensed station data (OpenChargeMap, OpenStreetMap) to populate
-- the map.
--
-- THE CRITICAL DISTINCTION
-- An imported station belongs to someone else. We cannot start a charge on
-- a Statiq or Tata Power charger — we have no roaming agreement and no
-- OCPI credentials with them. Showing those stations as if they were
-- startable would put a "Start charging" button on hardware we cannot
-- command, and the failure would land on the user standing at the charger.
--
-- So `source` is not decoration. `is_operable` is generated from it, the
-- UI keys the primary action off it, and start_charging_session() refuses
-- non-operable stations outright — the guarantee lives in the database
-- rather than in a component someone might forget to update.
-- =====================================================================

create type public.station_source as enum (
  'evrute',          -- onboarded by an owner; we control the charger
  'openchargemap',   -- imported, CC-BY-SA
  'openstreetmap',   -- imported, ODbL
  'government',      -- imported from a public dataset (BEE / data.gov.in)
  'manual'           -- hand-entered reference data
);

alter table public.stations
  add column source public.station_source not null default 'evrute',
  add column external_ref text,
  add column network text,          -- operator name, e.g. 'Statiq', 'Tata Power'
  add column data_attribution text, -- licence line we are obliged to display
  add column source_url text,
  add column last_synced_at timestamptz;

-- Derived, not assignable: no code path can mark an imported station
-- operable by mistake.
alter table public.stations
  add column is_operable boolean
  generated always as (source = 'evrute') stored;

-- One row per external record, so a re-run of the importer updates rather
-- than duplicates.
create unique index stations_source_external_ref_idx
  on public.stations (source, external_ref)
  where external_ref is not null;

create index stations_source_idx on public.stations (source);
create index stations_operable_geo_idx on public.stations using gist (geo)
  where is_operable;

-- Imported stations have no owner. Owned stations still must have one.
alter table public.stations alter column owner_id drop not null;
alter table public.stations
  add constraint stations_owner_required_for_evrute
  check (source <> 'evrute' or owner_id is not null);

-- Imported stations are reference data: no tariff, no connectors we control.
-- Make that explicit rather than letting a NULL tariff look like a bug.
comment on column public.stations.is_operable is
  'True only for EVRute-owned stations. Imported stations are discovery-only: '
  'navigable and searchable, but a charging session cannot be started on them.';

-- ---------------------------------------------------------------------
-- Hard guarantee: refuse to start a session on a station we do not run.
-- ---------------------------------------------------------------------
create or replace function evr.assert_station_operable(p_station_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, evr, extensions
as $$
declare
  v_source public.station_source;
begin
  select source into v_source from public.stations where id = p_station_id;
  if v_source is distinct from 'evrute' then
    raise exception
      'This station is listed for discovery only and is operated by another network. '
      'Use their app to start a charge here.'
      using errcode = 'check_violation';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Surface source/network/operability through search so the UI can show
-- the right action without a second round trip per station.
-- ---------------------------------------------------------------------
drop function if exists public.search_stations(
  numeric, numeric, integer, public.connector_type[], numeric, boolean, text, integer, integer);

create or replace function public.search_stations(
  p_lat             numeric,
  p_lng             numeric,
  p_radius_m        integer default 15000,
  p_connector_types public.connector_type[] default null,
  p_min_power_kw    numeric default null,
  p_only_available  boolean default false,
  p_query           text default null,
  p_limit           integer default 50,
  p_offset          integer default 0,
  p_only_operable   boolean default false
)
returns table (
  id uuid, name text, slug text, address_line1 text, city text, state text,
  lat numeric, lng numeric, distance_m double precision,
  amenities text[], photos text[], rating_avg numeric, rating_count integer,
  is_24x7 boolean, total_connectors bigint, available_connectors bigint,
  min_price_per_kwh numeric, max_power_kw numeric,
  connector_types public.connector_type[],
  source public.station_source, network text, is_operable boolean
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
      and (not p_only_operable or s.is_operable)
      and (p_query is null or s.name ilike '%' || p_query || '%'
           or s.city ilike '%' || p_query || '%'
           or s.network ilike '%' || p_query || '%')
  ),
  conn as (
    select
      ch.station_id,
      count(*)                                      as total_connectors,
      count(*) filter (where c.status = 'available') as available_connectors,
      max(c.power_kw)                                as max_power_kw,
      array_agg(distinct c.type)                     as connector_types
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
      and (p_connector_types is null
           or t.connector_type is null
           or t.connector_type = any (p_connector_types))
    group by t.station_id
  )
  select
    n.id, n.name, n.slug, n.address_line1, n.city, n.state, n.lat, n.lng,
    n.distance_m, n.amenities, n.photos, n.rating_avg, n.rating_count, n.is_24x7,
    coalesce(conn.total_connectors, 0),
    coalesce(conn.available_connectors, 0),
    price.min_price_per_kwh,
    conn.max_power_kw,
    coalesce(conn.connector_types, '{}'),
    n.source, n.network, n.is_operable
  from nearby n
  left join conn  on conn.station_id  = n.id
  left join price on price.station_id = n.id
  -- An imported station has no connectors in our database, so a connector
  -- filter must not silently delete it from the results; it is excluded
  -- only when the caller asked for operable stations.
  where (p_connector_types is null or conn.station_id is not null or not n.is_operable)
    and (not p_only_available
         or coalesce(conn.available_connectors, 0) > 0
         or not n.is_operable)
  order by n.is_operable desc, n.distance_m
  limit greatest(least(p_limit, 200), 1)
  offset greatest(p_offset, 0);
$$;

revoke execute on function public.search_stations(numeric, numeric, integer,
  public.connector_type[], numeric, boolean, text, integer, integer, boolean) from public;
grant execute on function public.search_stations(numeric, numeric, integer,
  public.connector_type[], numeric, boolean, text, integer, integer, boolean)
  to anon, authenticated;

-- ---------------------------------------------------------------------
-- Bulk upsert used by the importer. Service role only.
-- ---------------------------------------------------------------------
create or replace function public.upsert_external_stations(
  p_source public.station_source,
  p_rows   jsonb
)
returns table (inserted integer, updated integer)
language plpgsql
security definer
set search_path = public, evr, extensions
as $$
declare
  v_before bigint;
  v_after  bigint;
  v_touched bigint;
begin
  select count(*) into v_before from public.stations where source = p_source;

  with incoming as (
    select
      (r ->> 'external_ref')  as external_ref,
      (r ->> 'name')          as name,
      (r ->> 'address_line1') as address_line1,
      (r ->> 'city')          as city,
      (r ->> 'state')         as state,
      (r ->> 'postal_code')   as postal_code,
      (r ->> 'network')       as network,
      (r ->> 'source_url')    as source_url,
      (r ->> 'attribution')   as attribution,
      (r ->> 'lat')::numeric  as lat,
      (r ->> 'lng')::numeric  as lng,
      coalesce((r ->> 'is_24x7')::boolean, true) as is_24x7
    from jsonb_array_elements(p_rows) r
  )
  insert into public.stations (
    source, external_ref, name, slug, address_line1, city, state, postal_code,
    lat, lng, network, source_url, data_attribution, is_24x7, status,
    last_synced_at
  )
  select
    p_source,
    i.external_ref,
    i.name,
    -- Slug must satisfy the existing format check and stay unique across
    -- every source, hence the source prefix and external ref suffix.
    lower(p_source::text) || '-' ||
      regexp_replace(
        regexp_replace(lower(coalesce(nullif(btrim(i.name), ''), 'station')), '[^a-z0-9]+', '-', 'g'),
        '(^-+|-+$)', '', 'g'
      ) || '-' || i.external_ref,
    coalesce(nullif(btrim(i.address_line1), ''), 'Address not published'),
    coalesce(nullif(btrim(i.city), ''), 'Unknown'),
    coalesce(nullif(btrim(i.state), ''), 'Unknown'),
    case when i.postal_code ~ '^[0-9]{6}$' then i.postal_code else null end,
    i.lat, i.lng, i.network, i.source_url, i.attribution, i.is_24x7,
    'active', now()
  from incoming i
  where i.external_ref is not null
    and i.lat between -90 and 90
    and i.lng between -180 and 180
  on conflict (source, external_ref) where external_ref is not null
  do update set
    name             = excluded.name,
    address_line1    = excluded.address_line1,
    city             = excluded.city,
    state            = excluded.state,
    postal_code      = excluded.postal_code,
    lat              = excluded.lat,
    lng              = excluded.lng,
    network          = excluded.network,
    source_url       = excluded.source_url,
    data_attribution = excluded.data_attribution,
    last_synced_at   = now(),
    updated_at       = now();

  get diagnostics v_touched = row_count;
  select count(*) into v_after from public.stations where source = p_source;

  return query select (v_after - v_before)::int, (v_touched - (v_after - v_before))::int;
end;
$$;

revoke execute on function public.upsert_external_stations(public.station_source, jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_external_stations(public.station_source, jsonb)
  to service_role;
