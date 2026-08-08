-- =====================================================================
-- EVRute :: 0007 — Favorites, reviews, coupons, notifications, tickets
-- =====================================================================

create table public.favorites (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  station_id uuid not null references public.stations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, station_id)
);

create index favorites_station_idx on public.favorites (station_id);

-- ---------------------------------------------------------------------
-- Reviews — one per user per station, and only from users who have
-- actually completed a session there. Verified-purchase by construction.
-- ---------------------------------------------------------------------
create table public.reviews (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  station_id uuid not null references public.stations (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete set null,
  rating     smallint not null check (rating between 1 and 5),
  comment    text check (comment is null or length(comment) <= 2000),
  owner_reply text check (owner_reply is null or length(owner_reply) <= 2000),
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, station_id)
);

create index reviews_station_idx on public.reviews (station_id, created_at desc);
create index reviews_user_idx    on public.reviews (user_id);

create trigger reviews_touch before update on public.reviews
  for each row execute function evr.touch_updated_at();

-- Maintain the station's denormalised rating aggregate. Recomputing from
-- scratch on each change keeps it exactly correct, and review volume per
-- station is small enough that this is cheaper than an incremental hack
-- that can drift.
create or replace function evr.refresh_station_rating()
returns trigger
language plpgsql
security definer
set search_path = public, evr, extensions
as $$
declare
  v_station uuid := coalesce(new.station_id, old.station_id);
begin
  update public.stations s
  set rating_avg = coalesce((select round(avg(r.rating), 2) from public.reviews r where r.station_id = v_station), 0),
      rating_count = (select count(*) from public.reviews r where r.station_id = v_station),
      updated_at = now()
  where s.id = v_station;
  return coalesce(new, old);
end;
$$;

create trigger reviews_refresh_rating
  after insert or update or delete on public.reviews
  for each row execute function evr.refresh_station_rating();

-- ---------------------------------------------------------------------
-- Coupons
-- ---------------------------------------------------------------------
create table public.coupons (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique check (code ~ '^[A-Z0-9]{4,20}$'),
  title          text not null,
  description    text,
  discount_type  public.discount_type not null,
  value          numeric(10,2) not null check (value > 0),
  max_discount   numeric(10,2) check (max_discount is null or max_discount > 0),
  min_order      numeric(10,2) not null default 0 check (min_order >= 0),
  max_uses       integer check (max_uses is null or max_uses > 0),
  max_uses_per_user integer not null default 1 check (max_uses_per_user > 0),
  used_count     integer not null default 0 check (used_count >= 0),
  station_id     uuid references public.stations (id) on delete cascade,
  valid_from     timestamptz not null default now(),
  valid_to       timestamptz not null,
  is_active      boolean not null default true,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint coupons_window_valid check (valid_to > valid_from),
  constraint coupons_percent_bounded check (discount_type <> 'percent' or value <= 100)
);

create index coupons_active_idx on public.coupons (is_active, valid_to)
  where is_active;

create trigger coupons_touch before update on public.coupons
  for each row execute function evr.touch_updated_at();

create table public.coupon_redemptions (
  id          uuid primary key default gen_random_uuid(),
  coupon_id   uuid not null references public.coupons (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  session_id  uuid references public.sessions (id) on delete set null,
  amount_saved numeric(10,2) not null check (amount_saved >= 0),
  created_at  timestamptz not null default now(),
  unique (coupon_id, session_id)
);

create index coupon_redemptions_user_idx on public.coupon_redemptions (user_id, coupon_id);

alter table public.sessions
  add constraint sessions_coupon_fk
  foreign key (coupon_id) references public.coupons (id) on delete set null;

-- Keep used_count truthful without an application-side read-modify-write.
create or replace function evr.sync_coupon_usage()
returns trigger
language plpgsql
security definer
set search_path = public, evr, extensions
as $$
declare
  v_coupon uuid := coalesce(new.coupon_id, old.coupon_id);
begin
  update public.coupons c
  set used_count = (select count(*) from public.coupon_redemptions r where r.coupon_id = v_coupon),
      updated_at = now()
  where c.id = v_coupon;
  return coalesce(new, old);
end;
$$;

create trigger coupon_redemptions_sync
  after insert or delete on public.coupon_redemptions
  for each row execute function evr.sync_coupon_usage();

-- ---------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  channel    public.notification_channel not null default 'in_app',
  type       text not null,
  title      text not null,
  body       text not null,
  data       jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id)
  where read_at is null;

create table public.push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index push_tokens_user_idx on public.push_tokens (user_id);

-- ---------------------------------------------------------------------
-- Support tickets
-- ---------------------------------------------------------------------
create table public.tickets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  session_id  uuid references public.sessions (id) on delete set null,
  station_id  uuid references public.stations (id) on delete set null,
  subject     text not null check (length(btrim(subject)) between 3 and 200),
  description text not null check (length(btrim(description)) between 3 and 5000),
  status      public.ticket_status not null default 'open',
  priority    public.ticket_priority not null default 'medium',
  assigned_to uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index tickets_user_idx   on public.tickets (user_id, created_at desc);
create index tickets_status_idx on public.tickets (status, priority, created_at desc);

create trigger tickets_touch before update on public.tickets
  for each row execute function evr.touch_updated_at();

create table public.ticket_messages (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.tickets (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 5000),
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

create index ticket_messages_ticket_idx on public.ticket_messages (ticket_id, created_at);
