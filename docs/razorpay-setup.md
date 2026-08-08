# Razorpay setup

Everything the EVRute wallet needs from the Razorpay dashboard, and how to
test each path. Written from an actual test run — the failures listed here
are ones we hit, not hypotheticals.

---

## 1. Credentials

Dashboard → **Account & Settings → API Keys** → Generate (Test mode first).

Put them in `apps/web/.env.local` — **not** the monorepo root `.env`. Next.js
loads env files from the app directory, so a root copy is silently ignored
and will drift out of sync on the next rotation.

```
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxxxx
```

`NEXT_PUBLIC_RAZORPAY_KEY_ID` and `RAZORPAY_KEY_ID` must be the same value.
The key id is publishable; the **secret never gets a `NEXT_PUBLIC_` prefix**,
which would inline it into the browser bundle for every visitor.

Verify before touching the UI:

```bash
pnpm verify:razorpay
```

That authenticates, creates a real test-mode order, checks the amount
round-trips as paise, and proves signature verification rejects forged,
truncated, swapped and wrong-secret signatures. It also fails if the secret
is found in more than one env file.

---

## 2. Enable the payment methods you actually want

Dashboard → **Account & Settings → Payment Methods**.

A fresh test account does **not** have everything switched on, and the
failures are confusing because they arrive *after* a successful order —
the checkout modal opens fine, then rejects the payment.

| Method | Default | Notes |
|---|---|---|
| **UPI** | often **off** | Enable it. UPI is how most Indian users will pay. If it is off, the checkout modal simply has no UPI option — there is no error explaining why. |
| **Cards → International** | **off** | Leave off for an India-only product. While off, generic test PANs such as `4111 1111 1111 1111` are rejected with *"International cards are not supported"* even though Razorpay's own docs list that card as domestic — the BIN routes as international. |
| Netbanking | on | Works out of the box; best method for a first end-to-end test. |
| Wallets | on | Mobikwik, Airtel, Ola Money. |

None of this is a code problem. If a payment fails *inside* the Razorpay
modal, order creation already succeeded — look at the dashboard, not the app.

---

## 3. Webhook

Dashboard → **Account & Settings → Webhooks → Add New Webhook**.

| Field | Value |
|---|---|
| URL | `https://<your-domain>/api/webhooks/razorpay` |
| Active events | `payment.captured`, `payment.failed`, `refund.processed` |
| Secret | any strong random string → `RAZORPAY_WEBHOOK_SECRET` |

For local testing, tunnel first: `npx ngrok http 3000`, then use the ngrok
URL.

**This is not optional in production.** Checkout works without it, but the
verify call only fires if the user stays on the page. Someone who pays and
immediately closes the tab is credited *only* by the webhook. Without it
their money leaves and their wallet does not move.

The app degrades honestly: `getPaymentProvider()` logs a warning when the
secret is unset, and `verifyWebhookSignature` fails closed — an unverifiable
delivery is rejected rather than trusted.

---

## 4. Testing each path

| Method | Input | Result |
|---|---|---|
| UPI | `success@razorpay` | success |
| UPI | `failure@razorpay` | failure — exercises the `payment.failed` handler |
| Netbanking | any bank → mock page | choose **Success** or **Failure** |
| Card (domestic) | `5104 0155 5555 5558`, any CVV, any future expiry | success |
| Card OTP screen | 4–10 digits | success |
| Card OTP screen | fewer than 4 digits | failure |

**Test-mode quirk:** cancelling a payment in test mode registers as a
*successful* payment. So closing the modal mid-payment will not reproduce
production cancellation behaviour — don't read a balance change there as a
bug in the dismiss handling.

### What a successful top-up should do

1. Balance increases by the amount
2. "Wallet topped up" toast
3. A new `credit` row appears in the ledger below
4. `wallet_transactions` gains exactly **one** row — replaying the webhook
   must never add a second

If (1)–(3) don't happen after a Razorpay success, that *is* a code problem.

---

## 5. Going live

- [ ] Complete Razorpay KYC (PAN, GST, bank account)
- [ ] Generate **Live mode** keys; replace every `rzp_test_` value
- [ ] Re-point the webhook at the production domain and rotate its secret
- [ ] Enable UPI in live mode too — it is a separate toggle from test
- [ ] Set the same variables in the Vercel project's environment
- [ ] Rotate any credential that has ever been pasted into a chat, ticket or
      commit
- [ ] Run one real low-value transaction and confirm it reconciles against
      `payments`, `wallet_transactions` and the Razorpay dashboard

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| "Payments are not configured on this server" | `SUPABASE_SERVICE_ROLE_KEY` missing — the `payments` insert needs it |
| "Razorpay is not configured…" | `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` missing |
| No UPI option in the modal | UPI not enabled on the account (§2) |
| "International cards are not supported" | International payments off; use a domestic card, UPI or netbanking (§2) |
| Payment succeeds, wallet unchanged | Verify call failed *and* no webhook configured (§3) — check `payments.status` |
| Webhook delivers but nothing happens | `RAZORPAY_WEBHOOK_SECRET` wrong; signature fails closed and the delivery is rejected |
| Env change appears to do nothing | Next.js reads env at boot — restart the dev server |
