/**
 * Razorpay adapter.
 *
 * Razorpay works in paise (integer). Every amount crossing this boundary is
 * converted exactly once, here, using the shared paise helpers — so a
 * rounding decision is never made in two places with two different rules.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { fromPaise, toPaise } from '../../money/pricing';
import {
  PaymentProviderError,
  type CreateOrderInput,
  type PaymentEvent,
  type PaymentEventType,
  type PaymentProvider,
  type ProviderOrder,
  type RefundResult,
} from '../payment-provider';

export interface RazorpayConfig {
  readonly keyId: string;
  readonly keySecret: string;
  /**
   * Only required to verify INBOUND webhooks. Creating orders, fetching
   * payments and verifying the checkout signature all use `keySecret`.
   * Optional so checkout is never blocked on a credential it does not use;
   * `verifyWebhookSignature` fails closed when it is absent.
   */
  readonly webhookSecret?: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
}

const EVENT_MAP: Record<string, PaymentEventType> = {
  'payment.authorized': 'payment.authorized',
  'payment.captured': 'payment.captured',
  'payment.failed': 'payment.failed',
  'refund.processed': 'refund.processed',
};

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export class RazorpayAdapter implements PaymentProvider {
  readonly name = 'razorpay' as const;
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #auth: string;

  constructor(private readonly config: RazorpayConfig) {
    if (!config.keyId || !config.keySecret) {
      throw new Error('RazorpayAdapter requires keyId and keySecret');
    }
    this.#baseUrl = config.baseUrl ?? 'https://api.razorpay.com/v1';
    this.#fetch = config.fetchImpl ?? fetch;
    this.#auth = Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64');
  }

  async #request<T>(operation: string, path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}${path}`, {
        ...init,
        headers: {
          authorization: `Basic ${this.#auth}`,
          'content-type': 'application/json',
          ...init.headers,
        },
      });
    } catch (cause) {
      throw new PaymentProviderError(`network error calling ${operation}`, {
        provider: this.name,
        operation,
        retryable: true,
        cause,
      });
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new PaymentProviderError(
        `${operation} failed with ${response.status}: ${body.slice(0, 300)}`,
        {
          provider: this.name,
          operation,
          status: response.status,
          retryable: RETRYABLE_STATUS.has(response.status),
        },
      );
    }

    return (await response.json()) as T;
  }

  async createOrder(input: CreateOrderInput): Promise<ProviderOrder> {
    if (input.amount <= 0) throw new PaymentProviderError('amount must be positive', {
      provider: this.name, operation: 'createOrder', retryable: false,
    });

    const order = await this.#request<RawOrder>('createOrder', '/orders', {
      method: 'POST',
      body: JSON.stringify({
        amount: toPaise(input.amount),
        currency: input.currency,
        // Razorpay enforces uniqueness on receipt, which makes a retried
        // create idempotent rather than producing two orders.
        receipt: input.referenceId,
        notes: { ...input.notes, evrute_payment_id: input.referenceId, user_id: input.userId },
      }),
    });

    return {
      providerOrderId: order.id,
      amount: fromPaise(order.amount),
      currency: order.currency,
      checkout: {
        key: this.config.keyId,      // publishable, safe to send to the browser
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        name: 'EVRute',
        description: 'Wallet top-up',
      },
    };
  }

  async fetchPayment(providerPaymentId: string) {
    const p = await this.#request<RawPayment>(
      'fetchPayment',
      `/payments/${encodeURIComponent(providerPaymentId)}`,
    );
    return {
      status: mapStatus(p.status),
      amount: fromPaise(p.amount ?? 0),
      providerOrderId: p.order_id ?? null,
      method: p.method ?? null,
    };
  }

  async refund(providerPaymentId: string, amount: number, idempotencyKey: string): Promise<RefundResult> {
    const r = await this.#request<RawRefund>(
      'refund',
      `/payments/${encodeURIComponent(providerPaymentId)}/refund`,
      {
        method: 'POST',
        headers: { 'x-razorpay-idempotency-key': idempotencyKey },
        body: JSON.stringify({ amount: toPaise(amount), speed: 'normal' }),
      },
    );
    return {
      providerRefundId: r.id,
      amount: fromPaise(r.amount ?? 0),
      status: r.status === 'processed' ? 'processed' : r.status === 'failed' ? 'failed' : 'pending',
    };
  }

  verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
    if (!signature || !this.config.webhookSecret) return false;
    const expected = createHmac('sha256', this.config.webhookSecret)
      .update(rawBody, 'utf8')
      .digest('hex');
    return safeEqualHex(expected, signature);
  }

  /**
   * Razorpay signs `order_id|payment_id` with the API key secret on the
   * client success callback. Without this check anyone can POST a fake
   * "payment succeeded" to our callback route and top up a wallet for free.
   */
  verifyCheckoutSignature(params: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): boolean {
    const expected = createHmac('sha256', this.config.keySecret)
      .update(`${params.orderId}|${params.paymentId}`, 'utf8')
      .digest('hex');
    return safeEqualHex(expected, params.signature);
  }

  parseWebhookEvent(payload: unknown): PaymentEvent | null {
    if (typeof payload !== 'object' || payload === null) return null;
    const body = payload as RawWebhook;

    const type = EVENT_MAP[body.event ?? ''];
    if (!type) return null;

    const entity =
      body.payload?.payment?.entity ?? body.payload?.refund?.entity ?? undefined;
    if (!entity) return null;

    return {
      // Razorpay does not always send a top-level event id; the composite
      // of entity id + event name is stable and unique per delivery.
      eventId: body.id ?? `${entity.id}:${body.event}`,
      type,
      providerOrderId: entity.order_id ?? null,
      providerPaymentId: entity.payment_id ?? entity.id ?? null,
      amount: fromPaise(entity.amount ?? 0),
      method: entity.method ?? null,
      failureReason: entity.error_description ?? null,
      occurredAt: body.created_at
        ? new Date(body.created_at * 1000).toISOString()
        : new Date().toISOString(),
    };
  }
}

function safeEqualHex(expected: string, received: string): boolean {
  const clean = received.startsWith('sha256=') ? received.slice(7) : received;
  if (clean.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(clean, 'hex'));
  } catch {
    return false;
  }
}

function mapStatus(status: string | undefined) {
  switch (status) {
    case 'captured': return 'captured' as const;
    case 'authorized': return 'authorized' as const;
    case 'failed': return 'failed' as const;
    case 'refunded': return 'refunded' as const;
    default: return 'created' as const;
  }
}

interface RawOrder { id: string; amount: number; currency: string }
interface RawPayment { id: string; status?: string; amount?: number; order_id?: string; method?: string }
interface RawRefund { id: string; amount?: number; status?: string }
interface RawEntity {
  id?: string; order_id?: string; payment_id?: string; amount?: number;
  method?: string; error_description?: string;
}
interface RawWebhook {
  id?: string; event?: string; created_at?: number;
  payload?: { payment?: { entity?: RawEntity }; refund?: { entity?: RawEntity } };
}
