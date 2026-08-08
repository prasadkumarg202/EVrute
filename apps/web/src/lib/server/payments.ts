import 'server-only';

import { RazorpayAdapter, type PaymentProvider } from '@evrute/core/server';
import { ConfigurationError, isProduction, serverEnv } from '@/lib/env';

/**
 * Composition root for the payment provider on the server.
 *
 * Unlike charging there is no dev/test simulator here — money code paths
 * are exercised against the real Razorpay test-mode API instead, so a
 * missing credential is always an error, in every environment.
 */

let cached: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;

  const env = serverEnv();

  if (env.PAYMENT_PROVIDER === 'cashfree') {
    throw new ConfigurationError(
      'Cashfree adapter is not implemented yet. Implement PaymentProvider in ' +
        'a cashfree adapter and register it in lib/server/payments.ts.',
    );
  }

  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET } = env;

  // Only the two credentials checkout actually uses are required here.
  // RAZORPAY_WEBHOOK_SECRET is needed solely to verify inbound webhooks;
  // demanding it to CREATE an order blocked the whole payment flow on a
  // credential that path never touches. The webhook route checks for it
  // separately and rejects unverifiable deliveries.
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new ConfigurationError(
      'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET' +
        (isProduction ? '' : ' in apps/web/.env.local') + '.',
    );
  }

  if (!RAZORPAY_WEBHOOK_SECRET) {
    // Loud, but not fatal: checkout works, webhook reconciliation does not.
    console.warn(
      'RAZORPAY_WEBHOOK_SECRET is not set. Checkout will work, but inbound ' +
        'Razorpay webhooks cannot be verified and will be rejected — a user ' +
        'who closes the tab mid-payment will not be credited automatically.',
    );
  }

  cached = new RazorpayAdapter({
    keyId: RAZORPAY_KEY_ID,
    keySecret: RAZORPAY_KEY_SECRET,
    ...(RAZORPAY_WEBHOOK_SECRET ? { webhookSecret: RAZORPAY_WEBHOOK_SECRET } : {}),
  });
  return cached;
}
