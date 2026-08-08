import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentProviderError } from '../payment-provider';
import { RazorpayAdapter } from './razorpay.adapter';

const CONFIG = {
  keyId: 'rzp_test_key',
  keySecret: 'test-key-secret',
  webhookSecret: 'test-webhook-secret',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function hmac(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

describe('RazorpayAdapter', () => {
  it('throws at construction time without keyId or keySecret', () => {
    expect(() => new RazorpayAdapter({ ...CONFIG, keyId: '' })).toThrow();
    expect(() => new RazorpayAdapter({ ...CONFIG, keySecret: '' })).toThrow();
  });

  describe('createOrder', () => {
    it('converts rupees to paise exactly and sets receipt to the reference id', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        jsonResponse(200, { id: 'order_abc123', amount: 123456, currency: 'INR' }),
      );
      const adapter = new RazorpayAdapter({ ...CONFIG, fetchImpl });

      const order = await adapter.createOrder({
        amount: 1234.56,
        currency: 'INR',
        referenceId: 'payment-ref-42',
        userId: 'user-1',
      });

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.amount).toBe(123456);
      expect(body.receipt).toBe('payment-ref-42');
      expect(body.notes.evrute_payment_id).toBe('payment-ref-42');

      expect(order.providerOrderId).toBe('order_abc123');
      expect(order.amount).toBe(1234.56);
      expect(order.checkout.order_id).toBe('order_abc123');
      expect(order.checkout.key).toBe(CONFIG.keyId);
      // The checkout payload must never carry the key secret.
      expect(JSON.stringify(order.checkout)).not.toContain(CONFIG.keySecret);
    });

    it('rejects a non-positive amount before ever calling fetch', async () => {
      const fetchImpl = vi.fn();
      const adapter = new RazorpayAdapter({ ...CONFIG, fetchImpl });

      await expect(
        adapter.createOrder({ amount: 0, currency: 'INR', referenceId: 'r1', userId: 'u1' }),
      ).rejects.toBeInstanceOf(PaymentProviderError);
      await expect(
        adapter.createOrder({ amount: -10, currency: 'INR', referenceId: 'r1', userId: 'u1' }),
      ).rejects.toBeInstanceOf(PaymentProviderError);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('marks a 5xx as retryable and a 4xx as not retryable', async () => {
      const retryableFetch = vi.fn().mockResolvedValue(new Response('down', { status: 502 }));
      const retryableAdapter = new RazorpayAdapter({ ...CONFIG, fetchImpl: retryableFetch });
      await expect(
        retryableAdapter.createOrder({ amount: 10, currency: 'INR', referenceId: 'r1', userId: 'u1' }),
      ).rejects.toMatchObject({ options: expect.objectContaining({ retryable: true }) });

      const badRequestFetch = vi.fn().mockResolvedValue(new Response('bad', { status: 400 }));
      const badRequestAdapter = new RazorpayAdapter({ ...CONFIG, fetchImpl: badRequestFetch });
      await expect(
        badRequestAdapter.createOrder({ amount: 10, currency: 'INR', referenceId: 'r1', userId: 'u1' }),
      ).rejects.toMatchObject({ options: expect.objectContaining({ retryable: false }) });
    });

    it('turns a network throw into a retryable PaymentProviderError', async () => {
      const fetchImpl = vi.fn().mockRejectedValue(new TypeError('network down'));
      const adapter = new RazorpayAdapter({ ...CONFIG, fetchImpl });
      await expect(
        adapter.createOrder({ amount: 10, currency: 'INR', referenceId: 'r1', userId: 'u1' }),
      ).rejects.toMatchObject({ options: expect.objectContaining({ retryable: true }) });
    });
  });

  describe('verifyCheckoutSignature — the check that stops free wallet top-ups', () => {
    let adapter: RazorpayAdapter;
    beforeEach(() => {
      adapter = new RazorpayAdapter(CONFIG);
    });

    it('accepts a correctly signed order_id|payment_id pair', () => {
      const orderId = 'order_abc123';
      const paymentId = 'pay_xyz789';
      const signature = hmac(CONFIG.keySecret, `${orderId}|${paymentId}`);

      expect(adapter.verifyCheckoutSignature({ orderId, paymentId, signature })).toBe(true);
    });

    it('rejects a forged signature (wrong secret)', () => {
      const orderId = 'order_abc123';
      const paymentId = 'pay_xyz789';
      const forged = hmac('attacker-does-not-know-the-secret', `${orderId}|${paymentId}`);

      expect(adapter.verifyCheckoutSignature({ orderId, paymentId, signature: forged })).toBe(false);
    });

    it('rejects when the attacker swaps in a different, unrelated but correctly-formatted signature', () => {
      const orderId = 'order_abc123';
      const paymentId = 'pay_xyz789';
      // Valid signature — but for a DIFFERENT order/payment pair.
      const signatureForOtherOrder = hmac(CONFIG.keySecret, 'order_OTHER|pay_OTHER');

      expect(
        adapter.verifyCheckoutSignature({ orderId, paymentId, signature: signatureForOtherOrder }),
      ).toBe(false);
    });

    it('rejects a tampered payment id even if the order id and secret are right', () => {
      const orderId = 'order_abc123';
      const signature = hmac(CONFIG.keySecret, `${orderId}|pay_real`);
      expect(
        adapter.verifyCheckoutSignature({ orderId, paymentId: 'pay_fake', signature }),
      ).toBe(false);
    });

    it('rejects a garbage / non-hex signature without throwing', () => {
      expect(
        adapter.verifyCheckoutSignature({
          orderId: 'order_1',
          paymentId: 'pay_1',
          signature: 'not-a-valid-hex-signature',
        }),
      ).toBe(false);
    });

    it('rejects an empty signature', () => {
      expect(
        adapter.verifyCheckoutSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: '' }),
      ).toBe(false);
    });
  });

  describe('verifyWebhookSignature', () => {
    let adapter: RazorpayAdapter;
    const body = JSON.stringify({ event: 'payment.captured' });

    beforeEach(() => {
      adapter = new RazorpayAdapter(CONFIG);
    });

    it('accepts a correct signature', () => {
      const signature = hmac(CONFIG.webhookSecret, body);
      expect(adapter.verifyWebhookSignature(body, signature)).toBe(true);
    });

    it('accepts the "sha256=" prefixed form', () => {
      const signature = `sha256=${hmac(CONFIG.webhookSecret, body)}`;
      expect(adapter.verifyWebhookSignature(body, signature)).toBe(true);
    });

    it('rejects a forged signature', () => {
      const forged = hmac('wrong-secret', body);
      expect(adapter.verifyWebhookSignature(body, forged)).toBe(false);
    });

    it('rejects a tampered body', () => {
      const signature = hmac(CONFIG.webhookSecret, body);
      const tamperedBody = JSON.stringify({ event: 'refund.processed' });
      expect(adapter.verifyWebhookSignature(tamperedBody, signature)).toBe(false);
    });

    it('rejects a null signature', () => {
      expect(adapter.verifyWebhookSignature(body, null)).toBe(false);
    });
  });

  describe('parseWebhookEvent', () => {
    let adapter: RazorpayAdapter;
    beforeEach(() => {
      adapter = new RazorpayAdapter(CONFIG);
    });

    it('converts paise back to rupees for a payment.captured event', () => {
      const parsed = adapter.parseWebhookEvent({
        id: 'evt_1',
        event: 'payment.captured',
        created_at: 1_700_000_000,
        payload: {
          payment: {
            entity: {
              id: 'pay_1',
              order_id: 'order_1',
              amount: 123456,
              method: 'upi',
            },
          },
        },
      });

      expect(parsed).not.toBeNull();
      expect(parsed?.type).toBe('payment.captured');
      expect(parsed?.amount).toBe(1234.56);
      expect(parsed?.providerOrderId).toBe('order_1');
      expect(parsed?.providerPaymentId).toBe('pay_1');
      expect(parsed?.occurredAt).toBe(new Date(1_700_000_000 * 1000).toISOString());
    });

    it('handles a refund.processed event via the refund entity', () => {
      const parsed = adapter.parseWebhookEvent({
        id: 'evt_2',
        event: 'refund.processed',
        payload: {
          refund: {
            entity: { id: 'rfnd_1', payment_id: 'pay_1', amount: 5000 },
          },
        },
      });

      expect(parsed).not.toBeNull();
      expect(parsed?.type).toBe('refund.processed');
      expect(parsed?.amount).toBe(50);
      expect(parsed?.providerPaymentId).toBe('pay_1');
    });

    it('returns null for an unrecognised event type', () => {
      expect(adapter.parseWebhookEvent({ id: 'evt_3', event: 'order.paid', payload: {} })).toBeNull();
    });

    it('returns null when neither payment nor refund entity is present', () => {
      expect(
        adapter.parseWebhookEvent({ id: 'evt_4', event: 'payment.captured', payload: {} }),
      ).toBeNull();
    });

    it('returns null for malformed payloads', () => {
      expect(adapter.parseWebhookEvent(null)).toBeNull();
      expect(adapter.parseWebhookEvent('a string')).toBeNull();
      expect(adapter.parseWebhookEvent(42)).toBeNull();
    });

    it('falls back to a composite event id when the vendor omits a top-level id', () => {
      const parsed = adapter.parseWebhookEvent({
        event: 'payment.failed',
        payload: { payment: { entity: { id: 'pay_9', error_description: 'insufficient funds' } } },
      });
      expect(parsed?.eventId).toBe('pay_9:payment.failed');
      expect(parsed?.failureReason).toBe('insufficient funds');
    });
  });

  describe('fetchPayment status mapping', () => {
    it.each([
      ['captured', 'captured'],
      ['authorized', 'authorized'],
      ['failed', 'failed'],
      ['refunded', 'refunded'],
      ['created', 'created'],
      ['some_unknown_status', 'created'],
    ])('maps Razorpay status "%s" to "%s"', async (raw, expected) => {
      const fetchImpl = vi.fn().mockResolvedValue(
        jsonResponse(200, { id: 'pay_1', status: raw, amount: 10000, order_id: 'order_1', method: 'card' }),
      );
      const adapter = new RazorpayAdapter({ ...CONFIG, fetchImpl });
      const result = await adapter.fetchPayment('pay_1');
      expect(result.status).toBe(expected);
      expect(result.amount).toBe(100);
      expect(result.providerOrderId).toBe('order_1');
    });
  });
});

describe('webhookSecret is optional and independent of checkout', () => {
  // Regression: getPaymentProvider() used to require RAZORPAY_WEBHOOK_SECRET
  // before it would construct the adapter at all, so an unset webhook secret
  // took down order creation — a path that never touches it. Checkout must
  // work without it; webhook verification must fail closed.
  const withoutWebhookSecret = new RazorpayAdapter({
    keyId: 'rzp_test_key',
    keySecret: 'test-secret',
  });

  it('creates an order without a webhook secret', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ id: 'order_1', amount: 25000, currency: 'INR' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as typeof fetch;

    const adapter = new RazorpayAdapter({
      keyId: 'rzp_test_key',
      keySecret: 'test-secret',
      fetchImpl,
    });

    const order = await adapter.createOrder({
      amount: 250,
      currency: 'INR',
      referenceId: 'ref-1',
      userId: 'user-1',
    });

    expect(order.providerOrderId).toBe('order_1');
    expect(order.amount).toBe(250);
  });

  it('still verifies the checkout signature without a webhook secret', () => {
    const signature = createHmac('sha256', 'test-secret')
      .update('order_1|pay_1')
      .digest('hex');

    expect(
      withoutWebhookSecret.verifyCheckoutSignature({
        orderId: 'order_1',
        paymentId: 'pay_1',
        signature,
      }),
    ).toBe(true);
  });

  it('fails CLOSED on webhook verification when no webhook secret is set', () => {
    const body = JSON.stringify({ event: 'payment.captured' });
    // Even a signature computed with the API key secret must be rejected —
    // absence of the webhook secret means we cannot verify, so we must not.
    const plausible = createHmac('sha256', 'test-secret').update(body).digest('hex');

    expect(withoutWebhookSecret.verifyWebhookSignature(body, plausible)).toBe(false);
    expect(withoutWebhookSecret.verifyWebhookSignature(body, 'anything')).toBe(false);
    expect(withoutWebhookSecret.verifyWebhookSignature(body, null)).toBe(false);
  });
});
