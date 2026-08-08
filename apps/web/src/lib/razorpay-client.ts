/**
 * Thin browser-side wrapper around the Razorpay Checkout script loaded via
 * `next/script` on the wallet page. The script attaches `window.Razorpay`
 * asynchronously, so callers poll briefly rather than assuming it is ready
 * the instant the page becomes interactive.
 */

export interface RazorpayCheckoutOptions {
  readonly key: string;
  readonly order_id: string;
  readonly amount: number;
  readonly currency: string;
  readonly name: string;
  readonly description: string;
  readonly prefill?: { readonly name?: string; readonly email?: string; readonly contact?: string };
  readonly theme?: { readonly color?: string };
  readonly handler: (response: {
    readonly razorpay_order_id: string;
    readonly razorpay_payment_id: string;
    readonly razorpay_signature: string;
  }) => void;
  readonly modal?: { readonly ondismiss?: () => void };
}

/**
 * Payload of Razorpay's `payment.failed` event. Every field is optional in
 * practice — a network-level failure produces a much thinner object than a
 * bank decline — so nothing here may be assumed present.
 */
export interface RazorpayFailure {
  readonly error?: {
    readonly code?: string;
    readonly description?: string;
    readonly reason?: string;
    readonly step?: string;
    readonly source?: string;
    readonly metadata?: { readonly order_id?: string; readonly payment_id?: string };
  };
}

interface RazorpayInstance {
  open(): void;
  /**
   * `payment.failed` fires when a payment attempt is rejected — declined
   * card, failed 3DS, insufficient funds. The modal stays OPEN so the user
   * can retry with another method, which is why this is not the same signal
   * as `modal.ondismiss` and must be handled separately.
   */
  on(event: 'payment.failed', handler: (response: RazorpayFailure) => void): void;
}

type RazorpayConstructor = new (options: RazorpayCheckoutOptions) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

export async function waitForRazorpay(timeoutMs = 6000): Promise<RazorpayConstructor | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (typeof window !== 'undefined' && window.Razorpay) return window.Razorpay;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return typeof window !== 'undefined' ? (window.Razorpay ?? null) : null;
}
