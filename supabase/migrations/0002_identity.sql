-- =====================================================================
-- EVRute :: 0002 — Identity: profiles, roles, vehicles
-- =====================================================================
-- profiles.id is 1:1 with auth.users.id. We never duplicate credentials;
-- Supabase Auth owns them. Role lives here and is mirrored into the JWT
-- via a custom access-token hook so RLS can read it without a table hit.
-- =====================================================================

create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  phone          text unique,
  email          citext unique,
  full_name      text not null default '',
  role           public.app_role not null default 'customer',
  auth_provider  public.auth_provider not null default 'otp',
  avatar_url     text,
  referral_code  text not null unique,
  referred_by    uuid references public.profiles (id) on delete set null,
  locale         text not null default 'en-IN',
  is_active      boolean not null default true,
  last_seen_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint profiles_phone_e164 check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  constraint profiles_referral_code_fmt check (referral_code ~ '^[A-Z0-9]{6,12}$'),
  constraint profiles_no_self_referral check (referred_by is distinct from id)
);

create index profiles_role_idx        on public.profiles (role);
create index profiles_referred_by_idx on public.profiles (referred_by);
create index profiles_created_at_idx  on public.profiles (created_at desc);
create index profiles_name_trgm_idx   on public.profiles using gin (full_name extensions.gin_trgm_ops);

create trigger profiles_touch before update on public.profiles
  for each row execute function evr.touch_updated_at();

-- ---------------------------------------------------------------------
-- Referral code generation — collision-safe, no ambiguous characters
-- ---------------------------------------------------------------------
create or replace function evr.generate_referral_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no I,O,0,1
  candidate text;
  attempt   int := 0;
begin
  loop
    candidate := '';
    for _i in 1..8 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles p where p.referral_code = candidate);
    attempt := attempt + 1;
    if attempt > 20 then
      raise exception 'could not allocate a unique referral code after % attempts', attempt;
    end if;
  end loop;
  return candidate;
end;
$$;

-- ---------------------------------------------------------------------
-- Provision a profile + wallet the moment an auth user is created.
-- Runs as SECURITY DEFINER because auth.users triggers execute as the
-- auth admin role, which has no rights on public.*.
-- ---------------------------------------------------------------------
create or replace function evr.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, evr, extensions
as $$
declare
  v_role     public.app_role;
  v_provider public.auth_provider;
begin
  v_role := coalesce(
    nullif(new.raw_app_meta_data ->> 'role', ''),
    'customer'
  )::public.app_role;

  v_provider := case
    when new.raw_app_meta_data ->> 'provider' = 'google' then 'google'
    when new.raw_app_meta_data ->> 'provider' = 'apple'  then 'apple'
    when new.phone is not null                           then 'otp'
    else 'email'
  end::public.auth_provider;

  insert into public.profiles (id, phone, email, full_name, role, auth_provider, referral_code)
  values (
    new.id,
    new.phone,
    nullif(new.email, '')::citext,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), ''),
    v_role,
    v_provider,
    evr.generate_referral_code()
  )
  on conflict (id) do nothing;

  insert into public.wallets (user_id) values (new.id) on conflict (user_id) do nothing;

  return new;
end;
$$;

-- Trigger is attached in 0005 once public.wallets exists.

-- ---------------------------------------------------------------------
-- Vehicles
-- ---------------------------------------------------------------------
create table public.vehicles (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles (id) on delete cascade,
  make                 text not null,
  model                text not null,
  nickname             text,
  plate_number         text,
  connector_type       public.connector_type not null,
  battery_capacity_kwh numeric(6,2) not null check (battery_capacity_kwh > 0 and battery_capacity_kwh <= 500),
  max_charge_rate_kw   numeric(6,2) check (max_charge_rate_kw is null or max_charge_rate_kw > 0),
  is_primary           boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint vehicles_plate_fmt check (plate_number is null or plate_number ~ '^[A-Z0-9 -]{4,15}$')
);

create index vehicles_user_id_idx on public.vehicles (user_id);
-- Exactly one primary vehicle per user, enforced in the database rather
-- than in application code where a race can create two.
create unique index vehicles_one_primary_per_user_idx
  on public.vehicles (user_id) where (is_primary);

create trigger vehicles_touch before update on public.vehicles
  for each row execute function evr.touch_updated_at();

-- First vehicle a user adds is automatically their primary.
create or replace function evr.vehicles_default_primary()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from public.vehicles v where v.user_id = new.user_id) then
    new.is_primary := true;
  end if;
  return new;
end;
$$;

create trigger vehicles_default_primary before insert on public.vehicles
  for each row execute function evr.vehicles_default_primary();
