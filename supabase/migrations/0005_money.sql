-- =====================================================================
-- EVRute :: 0005 — Wallet ledger, holds, payments, invoices
-- =====================================================================
-- Invariant: wallets.balance is a CACHE. The ledger is the truth.
-- Every rupee that moves inserts a wallet_transactions row; a trigger
-- derives balance_after and updates the cache inside the same
-- transaction. Nothing in the codebase may UPDATE wallets.balance
-- directly — a trigger rejects it.
-- =====================================================================

create table public.wallets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique references public.profiles (id) on delete cascade,
  balance        numeric(14,2) not null default 0 check (balance >= 0),
  held_amount    numeric(14,2) not null default 0 check (held_amount >= 0),
  currency       char(3) not null default 'INR',
  is_frozen      boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index wallets_user_idx on public.wallets (user_id);

create trigger wallets_touch before update on public.wallets
  for each row execute function evr.touch_updated_at();

-- Now that wallets exists, wire the auth.users -> profile + wallet trigger.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function evr.handle_new_auth_user();

-- ---------------------------------------------------------------------
-- Ledger — append-only. No UPDATE, no DELETE, enforced by trigger.
-- ---------------------------------------------------------------------
create table public.wallet_transactions (
  id              bigint generated always as identity primary key,
  wallet_id       uuid not null references public.wallets (id) on delete restrict,
  user_id         uuid not null references public.profiles (id) on delete restrict,
  direction       public.ledger_direction not null,
  reason          public.ledger_reason not null,
  amount          numeric(14,2) not null check (amount > 0),
  balance_after   numeric(14,2) not null check (balance_after >= 0),
  session_id      uuid references public.sessions (id) on delete set null,
  payment_id      uuid,
  hold_id         uuid,
  reference       text,
  idempotency_key text unique,
  notes           text,
  created_at      timestamptz not null default now()
);

create index wallet_tx_wallet_idx  on public.wallet_transactions (wallet_id, id desc);
create index wallet_tx_user_idx    on public.wallet_transactions (user_id, created_at desc);
create index wallet_tx_session_idx on public.wallet_transactions (session_id)
  where session_id is not null;

-- Ledger immutability.
create or replace function evr.reject_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'wallet_transactions is append-only (attempted %)', tg_op
    using errcode = 'restrict_violation';
end;
$$;

create trigger wallet_tx_no_update before update on public.wallet_transactions
  for each row execute function evr.reject_ledger_mutation();
create trigger wallet_tx_no_delete before delete on public.wallet_transactions
  for each row execute function evr.reject_ledger_mutation();

-- Derive balance_after from the wallet row under a row lock, then write the
-- cache. Serialising on the wallet row is what makes concurrent debits safe.
create or replace function evr.apply_ledger_entry()
returns trigger
language plpgsql
security definer
set search_path = public, evr, extensions
as $$
declare
  v_balance numeric(14,2);
  v_frozen  boolean;
begin
  select w.balance, w.is_frozen into v_balance, v_frozen
  from public.wallets w
  where w.id = new.wallet_id
  for update;

  if not found then
    raise exception 'wallet % not found', new.wallet_id using errcode = 'foreign_key_violation';
  end if;

  if v_frozen and new.direction = 'debit' then
    raise exception 'wallet % is frozen; debits are blocked', new.wallet_id
      using errcode = 'check_violation';
  end if;

  if new.direction = 'credit' then
    v_balance := v_balance + new.amount;
  else
    if v_balance < new.amount then
      raise exception 'insufficient wallet balance: have %, need %', v_balance, new.amount
        using errcode = 'check_violation';
    end if;
    v_balance := v_balance - new.amount;
  end if;

  new.balance_after := v_balance;

  -- Flag the cache write as legitimate for the duration of this statement.
  perform set_config('evr.ledger_write', 'on', true);
  update public.wallets set balance = v_balance, updated_at = now()
  where id = new.wallet_id;
  perform set_config('evr.ledger_write', 'off', true);

  return new;
end;
$$;

create trigger wallet_tx_apply before insert on public.wallet_transactions
  for each row execute function evr.apply_ledger_entry();

-- Guard the cache: balance may only change via the ledger trigger, which
-- sets a transaction-local flag the guard checks for.
create or replace function evr.guard_wallet_balance()
returns trigger
language plpgsql
as $$
begin
  if new.balance is distinct from old.balance
     and coalesce(current_setting('evr.ledger_write', true), 'off') <> 'on' then
    raise exception 'wallets.balance is derived; insert a wallet_transactions row instead'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger wallets_guard_balance before update on public.wallets
  for each row execute function evr.guard_wallet_balance();

-- ---------------------------------------------------------------------
-- Holds — a soft reserve placed at session start so a user cannot start a
-- charge they cannot pay for. Held funds are excluded from spendable
-- balance but are NOT debited until the session closes.
-- ---------------------------------------------------------------------
create table public.wallet_holds (
  id           uuid primary key default gen_random_uuid(),
  wallet_id    uuid not null references public.wallets (id) on delete restrict,
  user_id      uuid not null references public.profiles (id) on delete restrict,
  session_id   uuid unique references public.sessions (id) on delete cascade,
  amount       numeric(14,2) not null check (amount > 0),
  status       public.hold_status not null default 'active',
  captured_amount numeric(14,2) check (captured_amount >= 0),
  expires_at   timestamptz not null default (now() + interval '6 hours'),
  released_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index wallet_holds_wallet_idx on public.wallet_holds (wallet_id) where status = 'active';
create index wallet_holds_expiry_idx on public.wallet_holds (expires_at) where status = 'active';

create trigger wallet_holds_touch before update on public.wallet_holds
  for each row execute function evr.touch_updated_at();

-- Keep wallets.held_amount consistent with active holds.
create or replace function evr.sync_held_amount()
returns trigger
language plpgsql
security definer
set search_path = public, evr, extensions
as $$
declare
  v_wallet uuid := coalesce(new.wallet_id, old.wallet_id);
begin
  update public.wallets w
  set held_amount = coalesce((
        select sum(h.amount) from public.wallet_holds h
        where h.wallet_id = v_wallet and h.status = 'active'
      ), 0),
      updated_at = now()
  where w.id = v_wallet;
  return coalesce(new, old);
end;
$$;

create trigger wallet_holds_sync
  after insert or update or delete on public.wallet_holds
  for each row execute function evr.sync_held_amount();

-- Spendable balance = balance - active holds. Used by every start-guard.
create or replace function public.spendable_balance(p_user_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public, evr, extensions
as $$
  select greatest(w.balance - w.held_amount, 0)
  from public.wallets w
  where w.user_id = p_user_id;
$$;

-- ---------------------------------------------------------------------
-- Payments (PSP orders)
-- ---------------------------------------------------------------------
create table public.payments (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete restrict,
  provider           public.payment_provider not null,
  provider_order_id  text not null,
  provider_payment_id text,
  provider_refund_id text,
  amount             numeric(12,2) not null check (amount > 0),
  currency           char(3) not null default 'INR',
  status             public.payment_status not null default 'created',
  purpose            public.payment_purpose not null default 'wallet_recharge',
  idempotency_key    text not null unique,
  method             text,
  failure_reason     text,
  captured_at        timestamptz,
  refunded_amount    numeric(12,2) not null default 0 check (refunded_amount >= 0),
  raw_payload        jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (provider, provider_order_id),
  constraint payments_refund_within_amount check (refunded_amount <= amount)
);

create index payments_user_idx   on public.payments (user_id, created_at desc);
create index payments_status_idx on public.payments (status);
create unique index payments_provider_payment_uidx
  on public.payments (provider, provider_payment_id) where provider_payment_id is not null;

create trigger payments_touch before update on public.payments
  for each row execute function evr.touch_updated_at();

alter table public.wallet_transactions
  add constraint wallet_tx_payment_fk
  foreign key (payment_id) references public.payments (id) on delete set null;
alter table public.wallet_transactions
  add constraint wallet_tx_hold_fk
  foreign key (hold_id) references public.wallet_holds (id) on delete set null;

-- ---------------------------------------------------------------------
-- Invoices — one per completed session, immutable once issued.
-- ---------------------------------------------------------------------
create sequence if not exists public.invoice_seq start 1;

create table public.invoices (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null unique references public.sessions (id) on delete restrict,
  user_id        uuid not null references public.profiles (id) on delete restrict,
  station_id     uuid not null references public.stations (id) on delete restrict,
  invoice_number text not null unique,
  issued_at      timestamptz not null default now(),
  energy_kwh     numeric(12,3) not null check (energy_kwh >= 0),
  subtotal       numeric(12,2) not null check (subtotal >= 0),
  tax_amount     numeric(12,2) not null check (tax_amount >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  total          numeric(12,2) not null check (total >= 0),
  currency       char(3) not null default 'INR',
  line_items     jsonb not null default '[]'::jsonb,
  pdf_path       text,
  created_at     timestamptz not null default now()
);

create index invoices_user_idx    on public.invoices (user_id, issued_at desc);
create index invoices_station_idx on public.invoices (station_id, issued_at desc);

create or replace function evr.next_invoice_number()
returns text
language sql
volatile
as $$
  select 'EVR-' || to_char(now(), 'YYYYMM') || '-' ||
         lpad(nextval('public.invoice_seq')::text, 7, '0');
$$;
