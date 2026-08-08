# eDRV setup

How to run EVRute against eDRV instead of the simulator. Written against
[docs.edrv.io](https://docs.edrv.io) API **v1.1**.

---

## What eDRV is doing for us

Everything that touches a charger. EVRute never speaks OCPP, never opens a
WebSocket to hardware, and never sees a `RemoteStartTransaction`. eDRV owns
charger connectivity, OCPP 1.6J/2.0.1, metering and firmware; we call REST
and receive webhooks.

That boundary is `ChargingProvider` in `packages/core`. Switching
ChargeLab → eDRV is one environment variable, because nothing above the
adapter knows which vendor is behind it.

---

## 1. Credentials

Ask eDRV for a **sandbox organisation** with simulated chargers, then from the
Admin Panel:

- **API key** — sent as `Authorization: Bearer <key>` on every request
- **Webhook signing secret** — Webhooks tab, eye icon next to your endpoint

```
CHARGING_PROVIDER=edrv
CHARGING_PROVIDER_API_KEY=<your eDRV API key>
CHARGING_PROVIDER_WEBHOOK_SECRET=<per-endpoint signing secret>
CHARGING_PROVIDER_BASE_URL=https://api.edrv.io/v1.1   # optional, this is the default
EDRV_ENERGY_UNIT=                                      # REQUIRED — see below
```

---

## 2. `EDRV_ENERGY_UNIT` — read this before you set it

**There is deliberately no default, and the app refuses to boot without it.**

eDRV reports metered energy in **Wh** in most deployments, but it is
account-configurable and the public docs don't state it unambiguously. Getting
it wrong misbills every session by **1000×** — an 18 kWh charge billed as
18,000 kWh, or ₹457 billed as ₹0.46.

That is not a defaultable value. Confirm it against one real session:

1. Run a session on a sandbox charger until it has delivered a known amount
2. `GET /v1.1/sessions/{id}` and read the raw `energy` field
3. Compare with what the eDRV dashboard displays in kWh
4. Raw value ≈ 1000× the dashboard → `Wh`. Roughly equal → `kWh`

Only then set it. `packages/core/src/charging/adapters/edrv.adapter.ts`
converts at exactly one place (`#toKwh`), so this is the only decision.

---

## 3. Map your users to eDRV users

eDRV keys every session to one of **its** user records — `POST /v1.1/sessions`
requires `{ connector, user }`, and `user` is an eDRV id, not our
`profiles.id`.

Migration `0022` adds `profiles.provider_user_ref` for the mapping. Until a
profile has one, `startCharging` fails immediately with a message naming the
column, rather than sending a request eDRV rejects with something opaque.

You need a provisioning step: on first charge (or at signup), create the eDRV
user via their API and store the returned id in `provider_user_ref`. The
unique index guarantees one EVRute profile per eDRV user — a duplicate would
bill two drivers' sessions to one provider account.

`profiles_awaiting_provider_ref_idx` indexes the un-provisioned customers, so
a backfill job has a cheap work queue.

---

## 4. Webhooks

Point eDRV at `https://<your-domain>/api/webhooks/charging`. Use ngrok
locally.

**Subscribe to at minimum:**

| Event | Effect |
|---|---|
| `session.started` | session → `active` |
| `session.ended` | session → `completed`, cost finalised, wallet debited, invoice issued |
| `session.start_failure`, `session.cancelled` | session → `failed`, hold released, connector freed |
| `session.ev_charged`, `session.updated` | running energy + cost |
| `chargestation.online` / `.offline` | connector availability |
| `chargestation.connector_status.updated` | connector status, incl. faults |

**Signature format:** `edrv-signature: t=<ms>,v1=<hex>` — HMAC-SHA256 of the
raw JSON body.

The adapter checks the **timestamp as well as the digest** (5-minute tolerance
by default, `EDRV_WEBHOOK_TOLERANCE_MS`). Without that, a valid signature is
replayable forever, and a replayed `session.ended` would re-close a session
and re-run its billing path.

`session.cancelled` fires if the charger doesn't confirm within 300 seconds —
treat it as a failure and unwind, which the handler does.

---

## 5. Two quirks that will trip you up

**Stop is a `GET`.** `GET /v1.1/sessions/{id}/stop`, not POST. It has a side
effect. If someone "corrects" it to POST, every stop 404s and sessions never
close. There's a test pinning the verb.

**Responses are wrapped.** Success bodies are `{ result: … }`. The adapter
unwraps in `#request`, so nothing above it needs to know.

**eDRV v1.1 has no reservations.** `reserveConnector` throws rather than
returning a fake reference that would show the user a reservation the charger
knows nothing about. If you need reservations, they must come from a different
provider or be modelled as a soft hold in EVRute only.

---

## 6. Switching over

```bash
pnpm test          # 53 eDRV tests among 232
pnpm typecheck
pnpm build
```

Then set `CHARGING_PROVIDER=edrv` and restart. Nothing else changes — no
call site in the app references eDRV directly.

**Before real money moves:**

- [ ] `EDRV_ENERGY_UNIT` confirmed against a real session (§2)
- [ ] `provider_user_ref` provisioning in place (§3)
- [ ] Webhook endpoint registered, secret set, a `session.ended` observed
      end-to-end
- [ ] One sandbox session run start → meter → stop → invoice, with the
      invoice total checked by hand against ₹/kWh × kWh + fee + GST
- [ ] Rate limits confirmed with eDRV, and `getConnectorStatus` polling used
      only as reconciliation, never as the primary signal

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| App won't start, "requires EDRV_ENERGY_UNIT" | Working as intended — §2 |
| "no eDRV user id for EVRute user …" | `provider_user_ref` not provisioned — §3 |
| Sessions stick at `pending` | Webhooks not arriving or failing verification; check the secret and the clock skew on your server |
| Every stop 404s | Something changed the stop call to POST — it is a GET |
| Energy off by 1000× | `EDRV_ENERGY_UNIT` is wrong. Fix it, then correct the affected invoices |
| Webhooks rejected right after deploy | Server clock drift beyond the 5-minute tolerance |
