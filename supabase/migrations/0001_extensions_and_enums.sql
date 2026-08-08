-- =====================================================================
-- EVRute :: 0001 — Extensions, schemas and domain enums
-- =====================================================================
-- Design notes:
--  * Money is stored as numeric(12,2) in INR. Postgres numeric is exact
--    decimal arithmetic, so there is no float drift. Conversion to paise
--    happens only at the PSP boundary (Razorpay/Cashfree take paise).
--  * Energy is numeric(12,3) kWh — metering precision from OCPP MeterValues.
--  * PostGIS backs proximity search (ST_DWithin on geography) instead of
--    naive lat/lng box maths, which is wrong near poles and slow at scale.
-- =====================================================================

create extension if not exists "pgcrypto"   with schema extensions;
create extension if not exists "citext"     with schema extensions;
create extension if not exists "postgis"    with schema extensions;
create extension if not exists "pg_trgm"    with schema extensions;
create extension if not exists "btree_gist" with schema extensions;

-- Private schema for security-definer helpers that must never be exposed
-- through PostgREST.
create schema if not exists evr;
revoke all on schema evr from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Identity & access
-- ---------------------------------------------------------------------
create type public.app_role as enum ('customer', 'owner', 'admin', 'employee');
create type public.auth_provider as enum ('otp', 'google', 'apple', 'email');

-- ---------------------------------------------------------------------
-- Hardware / assets
-- ---------------------------------------------------------------------
create type public.connector_type as enum ('CCS2', 'TYPE2', 'GBT', 'CHADEMO', 'AC_3PIN');
create type public.current_type   as enum ('AC', 'DC');
create type public.station_status as enum ('draft', 'under_review', 'active', 'maintenance', 'suspended');
create type public.charger_status as enum ('online', 'offline', 'faulted', 'maintenance');
create type public.connector_status as enum ('available', 'occupied', 'reserved', 'offline', 'faulted');

-- ---------------------------------------------------------------------
-- Charging lifecycle
-- ---------------------------------------------------------------------
create type public.session_status as enum ('pending', 'active', 'completed', 'failed', 'cancelled');
create type public.session_stop_reason as enum (
  'user_request', 'ev_disconnected', 'provider_stopped', 'insufficient_balance',
  'fault', 'timeout', 'admin_action'
);
create type public.reservation_status as enum ('pending', 'active', 'consumed', 'cancelled', 'expired');

-- ---------------------------------------------------------------------
-- Money
-- ---------------------------------------------------------------------
create type public.payment_provider as enum ('razorpay', 'cashfree');
create type public.payment_status   as enum ('created', 'authorized', 'captured', 'failed', 'refunded');
create type public.payment_purpose  as enum ('wallet_recharge', 'session_topup');
create type public.ledger_direction as enum ('credit', 'debit');
create type public.ledger_reason as enum (
  'wallet_recharge', 'session_charge', 'session_refund', 'hold_placed',
  'hold_released', 'referral_bonus', 'coupon_credit', 'manual_adjustment',
  'reservation_fee', 'reservation_refund'
);
create type public.hold_status as enum ('active', 'captured', 'released', 'expired');
create type public.settlement_status as enum ('pending', 'approved', 'processing', 'paid', 'failed');
create type public.discount_type as enum ('flat', 'percent');

-- ---------------------------------------------------------------------
-- Support & engagement
-- ---------------------------------------------------------------------
create type public.ticket_status   as enum ('open', 'in_progress', 'resolved', 'closed');
create type public.ticket_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.notification_channel as enum ('push', 'in_app', 'sms', 'email');

-- ---------------------------------------------------------------------
-- Shared trigger: keep updated_at honest
-- ---------------------------------------------------------------------
create or replace function evr.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
