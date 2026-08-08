# EVRute

EV charging platform for India — customer app, station-owner portal and admin
panel, built as one installable PWA on top of Supabase.

- **Customer**: find chargers, see live connector availability, start and stop a
  charge, pay from one wallet, get an invoice.
- **Owner**: stations, chargers, pricing, live sessions, settlements.
- **Admin**: platform totals, station approval, settlement queue, coupons,
  support, audit log.

---

## Why this shape

The handoff package (`Prototype scoping answers needed.zip`) specified NestJS +
Flutter + a separate Next.js portal — three codebases, three deploy targets, a
server to run, a Postgres to operate, and Dart plus TypeScript to hire for.

This build collapses that into **one Next.js 15 codebase and one Supabase
project**, because the same product requirements are met by both and only one of
them is affordable to run and change:

| | Specced stack | This build |
|---|---|---|
| Codebases | 3 | 1 |
| Backend | NestJS + TypeORM on a VM | Supabase (Postgres + Auth + Realtime + RLS) |
| Mobile | Flutter (Dart) | PWA, wrapped with Capacitor for the stores |
| Deploy targets | VM + Postgres + 2 web apps + 2 app stores | Vercel + Supabase |
| Running cost, month 1 | ~₹15–25k | ~₹0–2k |

What is **not** compromised: the `ChargingProvider` abstraction from the spec
survives intact as a TypeScript port, so the platform still never speaks OCPP,
and swapping ChargeLab → eDRV → an in-house OCPP server is one new adapter file.

The three surfaces share one component library and one status→colour mapping, so
"Active" looks the same to a driver, an owner and an admin — the spec called that
out and it is enforced in code rather than by review.

---

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 15.5 (App Router), React 19, TypeScript strict |
| Styling | Tailwind CSS v4, OKLCH design tokens, dark mode |
| PWA | Serwist service worker, installable, offline fallback, Web Push |
| Data | Supabase Postgres 17 + PostGIS, RLS on every table |
| Auth | Supabase Auth — phone OTP, email/password, Google |
| Realtime | Supabase Realtime for live session + connector status |
| Charging | ChargeLab / eDRV adapters behind `ChargingProvider` |
| Payments | Razorpay adapter behind `PaymentProvider` (Cashfree slot ready) |
| Tests | Vitest (179 unit tests), Playwright + axe-core (E2E + a11y) |

---

## Getting started

```bash
pnpm install
cp .env.example apps/web/.env.local   # fill in the Supabase + PSP values
pnpm dev                              # http://localhost:3000
```

`CHARGING_PROVIDER=simulator` (the default) runs a real in-memory charger state
machine, so the full charge flow works with no vendor account.

```bash
pnpm typecheck     # tsc --noEmit across the workspace
pnpm test          # 179 unit tests
pnpm build         # production build
pnpm e2e           # Playwright (needs network access to Supabase)
```

Wallet top-ups need Razorpay configured — see
[`docs/razorpay-setup.md`](docs/razorpay-setup.md) for credentials, which
payment methods to switch on, the webhook, and how to test each path.

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Customer | `demo.customer@evrute.in` | `Passw0rd!23` |
| Owner | `demo.owner@evrute.in` | `Passw0rd!23` |
| Admin | `demo.admin@evrute.in` | `Passw0rd!23` |

Seed stations are in Hyderabad. Change these before the project is public.

---

## Repository layout

```
apps/web/                 Next.js app — all three surfaces
  src/app/(customer)/       map, station, session, wallet, history, vehicles, rewards
  src/app/owner/            owner portal
  src/app/admin/            admin panel
  src/app/api/              route handlers: sessions, payments, webhooks, cron
  src/components/ui/        the shared primitive set
  src/lib/                  supabase clients, env validation, server helpers
packages/core/            domain logic, no framework
  src/charging/             ChargingProvider + ChargeLab/simulator adapters
  src/payments/             PaymentProvider + Razorpay adapter
  src/money/pricing.ts      the money maths (mirrors the SQL exactly)
  src/domain/status.ts      one status→presentation map for all surfaces
  src/resilience/           circuit breaker + jittered retry
packages/db/              generated Supabase types
supabase/migrations/      19 migrations, the schema of record
docs/                     Razorpay setup and operational runbooks
e2e/                      Playwright specs incl. axe accessibility scans
```

---

## Architecture notes

### The database is the security boundary

RLS is on for all 29 tables. Middleware role-gating is convenience; a request
that bypasses it still cannot read another tenant's rows. Owners see only their
own stations because every query is scoped server-side by `auth.uid()` — no
query anywhere trusts a client-supplied owner id.

`sessions`, `wallets`, `wallet_transactions`, `payments`, `invoices` and
`reservations` have INSERT/UPDATE/DELETE **revoked** from `anon` and
`authenticated`. Every mutation goes through a `SECURITY DEFINER` RPC that
re-derives the caller from the JWT.

### The ledger is the truth

`wallets.balance` is a cache. A database trigger rejects any direct write to it.
Money moves only by inserting a `wallet_transactions` row, whose BEFORE trigger
locks the wallet, checks sufficiency, derives `balance_after` and updates the
cache in the same transaction. The balance is always reconstructable from the
ledger.

### Idempotency is structural, not hopeful

Providers redeliver webhooks; users double-tap buttons; networks retry. So:

- `sessions.idempotency_key` is unique — replaying a start returns the original
  session instead of starting a second charge.
- A partial unique index allows at most one live session per connector, and one
  per user.
- `settlement_items.session_id` is unique — a session can be paid out once.
- `webhook_events (source, event_id)` is unique — redelivery is a no-op.
- Ledger writes lock the wallet row, then check the idempotency key, then insert.

That last one is not stylistic. `ON CONFLICT DO NOTHING` on the ledger looks
correct and is not: Postgres fires BEFORE INSERT triggers *before* the unique
index probe, so a duplicate skips the row but the money has already moved. A
redelivered ₹2,000 top-up became ₹4,000. See migration `0014`.

### Pricing is computed in one place, twice

`compute_session_cost` exists in SQL (authoritative, used by the stop path) and
in TypeScript (`packages/core/src/money/pricing.ts`, used to render the live
running cost). They are kept byte-identical in rounding order and pinned
together by a unit test asserting the exact production figure: 18.44 kWh ×
₹20.50 + ₹10 fee + 18% GST = ₹457.86. If either drifts, that test fails.

Tariffs are versioned, never updated in place, and a GiST exclusion constraint
forbids overlapping validity windows — so an invoice can always be reconstructed
from the tariff that was in force, and pricing is never ambiguous.

### Swapping the charging vendor

`ChargingProviderService` depends only on the `ChargingProvider` interface and
adds retries, a circuit breaker and structured logging. Today it binds to
`ChargeLabAdapter`. Writing `edrv.adapter.ts` or `in-house-ocpp.adapter.ts`
against the same interface and changing `CHARGING_PROVIDER` is the entire
migration — no call site changes.

### Imported stations are discovery-only

A charging app with five stations is not useful, so `stations` also carries
rows imported from open datasets (OpenChargeMap, OpenStreetMap, government
feeds) to make the map worth opening before EVRute has its own network. Those
stations belong to someone else — Statiq, Tata Power, ChargeMOD — and we have
no roaming agreement or OCPI credentials with any of them, so a "Start
charging" button on their hardware would be a promise we cannot keep.

`stations.is_operable` is a generated column (`source = 'evrute'`, migration
`0020`), not an application flag — no insert or update statement can set it,
so no code path can mark an imported station bookable by mistake. The UI keys
every primary action off it (map badges, station cards, the station detail
page), but the UI is a courtesy, not the guarantee. The guarantee is
`evr.assert_station_operable()`, called from `start_charging_session()`: it
re-checks `source` in the database on every attempt and raises rather than
starting a session on a station we do not run, regardless of what any client
sent.

Imported records also carry `data_attribution`, `network` and `source_url`.
Displaying the attribution line and a link back to the source record on the
station page is not a nice-to-have — it is a condition of the CC-BY-SA
(OpenStreetMap) and ODbL licences the data is imported under, so it is always
rendered, never hidden behind a toggle.

---

## Deployment

**Vercel** (app) + **Supabase** (data). `vercel.json` declares the cron
schedules:

| Job | Schedule | Purpose |
|---|---|---|
| `/api/cron/settlements` | Mon 02:00 UTC | Generate owner settlements |
| `/api/cron/rollup` | Daily 00:30 UTC | Analytics rollup tables |
| `/api/cron/expire` | Every 15 min | Expire stale reservations and holds |

All three are gated by `CRON_SECRET`, compared with `timingSafeEqual`.

### App stores

The PWA installs directly on Android and iOS from the browser. For Play Store
and App Store listings, wrap this same build with Capacitor — no rewrite, and
the service worker, manifest and offline behaviour carry over.

---

## Before going live

These are deliberate gaps, not oversights:

1. **Enable leaked-password protection** in Supabase Auth (one toggle; checks
   against HaveIBeenPwned).
2. **Provide real credentials**: ChargeLab/eDRV API key + webhook secret,
   Razorpay live keys, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`.
3. **Enable UPI in Razorpay** — Dashboard → Account & Settings → Payment
   Methods → UPI. It is often **off** by default, and when it is off the
   checkout modal simply has no UPI option with no error explaining why.
   UPI is how most Indian users will pay, so this is not optional at launch.
   The same screen controls Cards → International, which is why a generic
   test card can be rejected as "International cards are not supported".
   Full walkthrough: [`docs/razorpay-setup.md`](docs/razorpay-setup.md).
4. **Configure the Razorpay webhook** — without it, a user who closes the tab
   straight after paying is never credited. See the same document.
5. **Bank payouts**: `/api/admin/settlements/[id]/process` moves a settlement to
   `processing` and writes an audit row. It deliberately cannot reach `paid` —
   that transition belongs to a payout webhook from Razorpay Route or Cashfree
   Payouts, so the platform never claims to have paid an owner it has not.
6. **Rotate the demo accounts** and reseed with real stations.
7. **Invoice PDFs**: invoices are stored as structured line items and rendered
   print-ready in the browser. A server-side PDF renderer can write to
   `invoices.pdf_path` when a stored artefact is required for compliance.
