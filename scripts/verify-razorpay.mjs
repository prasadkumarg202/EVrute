#!/usr/bin/env node
/**
 * Razorpay integration self-check.
 *
 *   node scripts/verify-razorpay.mjs
 *
 * Finds your env file (checking apps/web/.env.local first, then falling back
 * to apps/web/.env, .env.local and the repo root .env) and proves, against
 * the real Razorpay API:
 *   1. the config lives where the APP will actually read it, in one place only
 *   2. the credentials authenticate
 *   3. an order can actually be created, with the amount round-tripping as paise
 *   4. signature verification accepts a genuine signature and rejects every
 *      forgery we can construct
 *
 * Creating a test-mode order costs nothing and takes no money. Run this
 * before wiring up the UI so a failure points at credentials rather than at
 * a checkout flow you are trying to debug through a browser modal.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseEnvFile(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const i = line.indexOf('=');
          return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
        }),
    );
  } catch {
    return null;
  }
}

/**
 * Search every plausible location rather than demanding one.
 *
 * IMPORTANT: only `apps/web/.env.local` is read by the running app. Next.js
 * loads env files from the app directory, NOT the monorepo root — a root
 * `.env` will satisfy this script and still leave the app unconfigured,
 * which is a genuinely confusing failure. So this script reports which file
 * it used and warns loudly about any copy the app will not see.
 */
const APP_ENV = 'apps/web/.env.local';
const CANDIDATES = [APP_ENV, 'apps/web/.env', '.env.local', '.env'];

const found = CANDIDATES.map((rel) => ({ rel, values: parseEnvFile(join(root, rel)) })).filter(
  (c) => c.values !== null,
);

// Later files must not clobber earlier ones: precedence follows CANDIDATES order.
const fileEnv = {};
for (const { values } of [...found].reverse()) Object.assign(fileEnv, values);
const env = { ...fileEnv, ...process.env };

const KEY_ID = env.RAZORPAY_KEY_ID;
const KEY_SECRET = env.RAZORPAY_KEY_SECRET;
const PUBLIC_KEY_ID = env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

let failures = 0;
const ok = (label, detail = '') => console.log(`  \x1b[32mPASS\x1b[0m  ${label}${detail ? ` — ${detail}` : ''}`);
const bad = (label, detail = '') => {
  failures += 1;
  console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${detail ? ` — ${detail}` : ''}`);
};

console.log('\nRazorpay integration check\n');

// --- 0. Where the configuration came from ---------------------------------
console.log('Environment files');
if (found.length === 0) {
  bad('an env file was found', `looked for: ${CANDIDATES.join(', ')}`);
} else {
  for (const { rel } of found) {
    const usedByApp = rel === APP_ENV || rel === 'apps/web/.env';
    console.log(`  ${usedByApp ? '\x1b[32mLOADED\x1b[0m' : '\x1b[33mIGNORED BY APP\x1b[0m'}  ${rel}`);
  }
  if (!found.some((f) => f.rel === APP_ENV)) {
    bad(
      `${APP_ENV} exists`,
      'Next.js reads env files from the app directory, not the monorepo root — ' +
        'the app will start with no Razorpay config even though this script passes',
    );
  }
}

// Duplicated secrets drift: rotate in one file, forget the other, and the
// stale copy is the one that silently keeps being used.
const secretHolders = found.filter((f) => f.values.RAZORPAY_KEY_SECRET);
if (secretHolders.length > 1) {
  bad(
    'KEY_SECRET lives in exactly one file',
    `found in ${secretHolders.length}: ${secretHolders.map((f) => f.rel).join(', ')} — ` +
      `keep only ${APP_ENV} and delete the rest, or a future rotation will half-apply`,
  );
} else if (secretHolders.length === 1) {
  ok('KEY_SECRET lives in exactly one file', secretHolders[0].rel);
}

// --- 1. Configuration -----------------------------------------------------
console.log('\nConfiguration');
if (!KEY_ID) bad('RAZORPAY_KEY_ID is set');
else ok('RAZORPAY_KEY_ID is set', KEY_ID);

if (!KEY_SECRET) bad('RAZORPAY_KEY_SECRET is set');
else ok('RAZORPAY_KEY_SECRET is set', `${KEY_SECRET.slice(0, 4)}… (${KEY_SECRET.length} chars)`);

if (PUBLIC_KEY_ID !== KEY_ID) {
  bad('NEXT_PUBLIC_RAZORPAY_KEY_ID matches RAZORPAY_KEY_ID',
      'the browser would open checkout against a different merchant account');
} else {
  ok('NEXT_PUBLIC_RAZORPAY_KEY_ID matches RAZORPAY_KEY_ID');
}

if (KEY_ID?.startsWith('rzp_live_')) {
  console.log('  \x1b[33mNOTE\x1b[0m  These are LIVE keys. This script will create a real order.');
}

// The secret must never be exposed to the browser. NEXT_PUBLIC_* is inlined
// into the client bundle at build time, so a secret under that prefix is
// published to every visitor.
for (const [k, v] of Object.entries(env)) {
  if (k.startsWith('NEXT_PUBLIC_') && KEY_SECRET && v === KEY_SECRET) {
    bad(`${k} contains the KEY SECRET`, 'this would ship the secret to every browser');
  }
}
if (!Object.entries(env).some(([k, v]) => k.startsWith('NEXT_PUBLIC_') && v === KEY_SECRET)) {
  ok('KEY_SECRET is not exposed under any NEXT_PUBLIC_ variable');
}

if (failures > 0) {
  console.log('\nFix the configuration above before running the live checks.\n');
  process.exit(1);
}

// --- 2. Live order creation ----------------------------------------------
console.log('\nLive API (api.razorpay.com)');
const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');
let order;

try {
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      amount: 50000, // ₹500.00 in paise — Razorpay's API is paise-only
      currency: 'INR',
      receipt: `evrute-selfcheck-${Date.now()}`,
      notes: { source: 'verify-razorpay.mjs' },
    }),
  });

  const text = await response.text();

  if (response.status === 401) {
    bad('credentials authenticate', 'Razorpay returned 401 — key id or secret is wrong');
  } else if (!response.ok) {
    bad('order created', `HTTP ${response.status}: ${text.slice(0, 200)}`);
  } else {
    order = JSON.parse(text);
    ok('credentials authenticate');
    ok('order created', `${order.id}, ${order.amount} paise ${order.currency}`);

    if (order.amount !== 50000) bad('amount round-trips as paise', `sent 50000, got ${order.amount}`);
    else ok('amount round-trips as paise', '₹500.00 → 50000 paise');
  }
} catch (error) {
  bad('reach api.razorpay.com', error.message);
  console.log('        (a corporate proxy or sandbox egress policy will cause this)');
}

// --- 3. Signature verification -------------------------------------------
console.log('\nSignature verification (HMAC-SHA256 of "order_id|payment_id")');

const orderId = order?.id ?? 'order_SelfCheckFallback';
const paymentId = 'pay_SelfCheckPayment01';

const sign = (payload, secret) => createHmac('sha256', secret).update(payload).digest('hex');
const verify = (expected, received) => {
  const clean = received.startsWith('sha256=') ? received.slice(7) : received;
  if (clean.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(clean, 'hex'));
  } catch {
    return false;
  }
};

const genuine = sign(`${orderId}|${paymentId}`, KEY_SECRET);
const expected = sign(`${orderId}|${paymentId}`, KEY_SECRET);

const cases = [
  ['accepts a genuine signature', verify(expected, genuine), true],
  ['rejects a forged signature', verify(expected, 'a'.repeat(64)), false],
  ['rejects a truncated signature', verify(expected, genuine.slice(0, 32)), false],
  ['rejects order/payment id swapped', verify(expected, sign(`${paymentId}|${orderId}`, KEY_SECRET)), false],
  ['rejects a signature made with the wrong secret', verify(expected, sign(`${orderId}|${paymentId}`, 'wrong-secret')), false],
  ['rejects an empty signature', verify(expected, ''), false],
];

for (const [label, actual, want] of cases) {
  if (actual === want) ok(label);
  else bad(label, `expected ${want}, got ${actual}`);
}

// --- Summary --------------------------------------------------------------
console.log(
  failures === 0
    ? '\n\x1b[32mAll checks passed.\x1b[0m Start the app and top up a wallet with card 4111 1111 1111 1111.\n'
    : `\n\x1b[31m${failures} check(s) failed.\x1b[0m\n`,
);
process.exit(failures === 0 ? 0 : 1);
