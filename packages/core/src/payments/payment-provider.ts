/**
 * Payment-provider boundary — the money equivalent of ChargingProvider.
 *
 * Razorpay and Cashfree sit behind one interface so the payments module is
 * never hard-wired to a single PSP: routing can be per-region, per-owner or
 * an A/B split, and a PSP outage becomes a config change rather than an
 * outage of the whole product.
 *
 * Raw card data never reaches this layer. The PSP's checkout SDK handles
 * the card, which keeps EVRute out of PCI-DSS scope entirely.
 */

export type PaymentProviderKind = 'razorpay' | 'cashfree';

export interface CreateOrderInput {
  /** Amount in INR (rupees). Adapters convert to paise at the wire. */
  readonly amount: number;
  readonly currency: 'INR';
  /** EVRute payment row id — round-tripped through the PSP for correlation. */
  readonly referenceId: string;
  readonly userId: string;
  readonly notes?: Record<string, string>;
}

export interface ProviderOrder {
  readonly providerOrderId: string;
  readonly amount: number;
  readonly currency: string;
  /** Everything the client checkout SDK needs. Never contains a secret. */
  readonly checkout: Record<string, string | number>;
}

export type PaymentEventType =
  | 'payment.authorized'
  | 'payment.captured'
  | 'payment.failed'
  | 'refund.processed';

export interface PaymentEvent {
  /** PSP event id — the dedupe key for webhook_events. */
  readonly eventId: string;
  readonly type: PaymentEventType;
  readonly providerOrderId: string | null;
  readonly providerPaymentId: string | null;
  /** INR, already converted from paise. */
  readonly amount: number;
  readonly method: string | null;
  readonly failureReason: string | null;
  readonly occurredAt: string;
}

export interface RefundResult {
  readonly providerRefundId: string;
  readonly amount: number;
  readonly status: 'pending' | 'processed' | 'failed';
}

export interface PaymentProvider {
  readonly name: PaymentProviderKind;

  createOrder(input: CreateOrderInput): Promise<ProviderOrder>;

  /**
   * Confirm a payment really is captured by asking the PSP directly.
   * Never trust the client's success callback — it is attacker-controlled.
   */
  fetchPayment(providerPaymentId: string): Promise<{
    readonly status: 'created' | 'authorized' | 'captured' | 'failed' | 'refunded';
    readonly amount: number;
    readonly providerOrderId: string | null;
    readonly method: string | null;
  }>;

  refund(providerPaymentId: string, amount: number, idempotencyKey: string): Promise<RefundResult>;

  verifyWebhookSignature(rawBody: string, signature: string | null): boolean;

  /**
   * Verify the signature the checkout SDK hands the browser on success.
   * Distinct from the webhook signature: different payload, different
   * canonical form.
   */
  verifyCheckoutSignature(params: {
    readonly orderId: string;
    readonly paymentId: string;
    readonly signature: string;
  }): boolean;

  parseWebhookEvent(payload: unknown): PaymentEvent | null;
}

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly options: {
      readonly provider: string;
      readonly operation: string;
      readonly status?: number;
      readonly retryable: boolean;
      readonly cause?: unknown;
    },
  ) {
    super(message);
    this.name = 'PaymentProviderError';
  }
}
