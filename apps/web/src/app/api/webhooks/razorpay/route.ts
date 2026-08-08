import 'server-only';

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PaymentEvent } from '@evrute/core';
import type { Database } from '@evrute/db/types';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { getPaymentProvider } from '@/lib/server/payments';
import {
  markWebhookFailed,
  markWebhookProcessed,
  readRawBody,
  recordWebhookEvent,
} from '@/lib/server/webhook';

export const dynamic = 'force-dynamic';

type AdminClient = SupabaseClient<Database>;

export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await readRawBody(request);
  const signature = request.headers.get('x-razorpay-signature');

  const provider = getPaymentProvider();

  if (!provider.verifyWebhookSignature(rawBody, signature)) {
    console.warn('webhooks.razorpay: signature verification failed');
    return NextResponse.json({ error: { code: 'unauthenticated', message: 'invalid signature' } }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: { code: 'bad_request', message: 'invalid JSON body' } }, { status: 400 });
  }

  const event = provider.parseWebhookEvent(payload);
  if (!event) {
    console.warn('webhooks.razorpay: unrecognised payload shape');
    return NextResponse.json({ ok: true });
  }

  const admin = createSupabaseAdminClient();
  const record = await recordWebhookEvent(admin, {
    source: 'razorpay',
    eventId: event.eventId,
    eventType: event.type,
    payload,
    signature,
  });

  if (record.alreadyProcessed) {
    return NextResponse.json({ ok: true });
  }

  try {
    await processPaymentEvent(admin, event);
    await markWebhookProcessed(admin, record.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('webhooks.razorpay: processing failed', {
      eventId: event.eventId,
      type: event.type,
      error,
    });
    await markWebhookFailed(admin, record.id, message);
    // Still 200: a 500 makes Razorpay retry forever, and the event is
    // durably recorded (with last_error set) for manual replay.
  }

  return NextResponse.json({ ok: true });
}

async function processPaymentEvent(admin: AdminClient, event: PaymentEvent): Promise<void> {
  switch (event.type) {
    case 'payment.authorized': {
      if (!event.providerOrderId) {
        console.warn('webhooks.razorpay: payment.authorized missing order id');
        return;
      }
      const payment = await findPaymentByOrderId(admin, event.providerOrderId);
      if (!payment) {
        console.warn('webhooks.razorpay: payment.authorized for unknown order', {
          providerOrderId: event.providerOrderId,
        });
        return;
      }
      if (payment.status === 'created') {
        const { error } = await admin
          .from('payments')
          .update({ status: 'authorized', provider_payment_id: event.providerPaymentId, method: event.method })
          .eq('id', payment.id);
        if (error) throw new Error(`payment.authorized update failed: ${error.message}`);
      }
      return;
    }

    case 'payment.captured': {
      if (!event.providerOrderId) {
        console.warn('webhooks.razorpay: payment.captured missing order id');
        return;
      }
      const payment = await findPaymentByOrderId(admin, event.providerOrderId);
      if (!payment) {
        console.warn('webhooks.razorpay: payment.captured for unknown order', {
          providerOrderId: event.providerOrderId,
        });
        return;
      }

      if (payment.status !== 'captured') {
        const { error } = await admin
          .from('payments')
          .update({
            status: 'captured',
            provider_payment_id: event.providerPaymentId,
            method: event.method,
            captured_at: event.occurredAt,
          })
          .eq('id', payment.id);
        if (error) throw new Error(`payment.captured update failed: ${error.message}`);
      }

      // Idempotent (unique idempotency_key on wallet_transactions per
      // 0014_fix_ledger_idempotency.sql) — safe even if the client-side
      // /verify route already credited this same payment.
      const { error: creditError } = await admin.rpc('credit_wallet_from_payment', {
        p_payment_id: payment.id,
      });
      if (creditError) throw new Error(`credit_wallet_from_payment failed: ${creditError.message}`);
      return;
    }

    case 'payment.failed': {
      if (!event.providerOrderId) {
        console.warn('webhooks.razorpay: payment.failed missing order id');
        return;
      }
      const payment = await findPaymentByOrderId(admin, event.providerOrderId);
      if (!payment) {
        console.warn('webhooks.razorpay: payment.failed for unknown order', {
          providerOrderId: event.providerOrderId,
        });
        return;
      }
      if (payment.status === 'created' || payment.status === 'authorized') {
        const { error } = await admin
          .from('payments')
          .update({
            status: 'failed',
            failure_reason: event.failureReason,
            provider_payment_id: event.providerPaymentId,
          })
          .eq('id', payment.id);
        if (error) throw new Error(`payment.failed update failed: ${error.message}`);
      }
      const { error: notifyError } = await admin.from('notifications').insert({
        user_id: payment.user_id,
        type: 'payment_failed',
        title: 'Payment failed',
        body: event.failureReason ?? 'Your payment could not be completed.',
        data: { payment_id: payment.id },
      });
      if (notifyError) throw new Error(`payment.failed notification failed: ${notifyError.message}`);
      return;
    }

    case 'refund.processed': {
      if (!event.providerPaymentId) {
        console.warn('webhooks.razorpay: refund.processed missing payment id');
        return;
      }
      const { data: payment, error } = await admin
        .from('payments')
        .select('id, amount, refunded_amount')
        .eq('provider', 'razorpay')
        .eq('provider_payment_id', event.providerPaymentId)
        .maybeSingle();
      if (error) throw new Error(`payment lookup for refund failed: ${error.message}`);
      if (!payment) {
        console.warn('webhooks.razorpay: refund.processed for unknown payment', {
          providerPaymentId: event.providerPaymentId,
        });
        return;
      }

      const refundedAmount = Math.min(payment.refunded_amount + event.amount, payment.amount);
      const isFullyRefunded = refundedAmount >= payment.amount;
      const { error: updateError } = await admin
        .from('payments')
        .update({
          refunded_amount: refundedAmount,
          ...(isFullyRefunded ? { status: 'refunded' as const } : {}),
        })
        .eq('id', payment.id);
      if (updateError) throw new Error(`refund.processed update failed: ${updateError.message}`);
      return;
    }

    default: {
      const exhaustive: never = event.type;
      console.warn('webhooks.razorpay: unhandled event type', { type: String(exhaustive) });
    }
  }
}

async function findPaymentByOrderId(
  admin: AdminClient,
  providerOrderId: string,
): Promise<{ id: string; status: Database['public']['Enums']['payment_status']; user_id: string } | null> {
  const { data, error } = await admin
    .from('payments')
    .select('id, status, user_id')
    .eq('provider', 'razorpay')
    .eq('provider_order_id', providerOrderId)
    .maybeSingle();
  if (error) throw new Error(`payment lookup by order id failed: ${error.message}`);
  return data;
}
