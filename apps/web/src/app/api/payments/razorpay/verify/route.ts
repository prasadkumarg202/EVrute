import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
  getSessionUser,
} from '@/lib/supabase/server';
import { getPaymentProvider } from '@/lib/server/payments';
import { errorResponse, mapPostgrestError, unexpectedError } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

type UserClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const bodySchema = z.object({
  paymentId: z.string().uuid(),
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return errorResponse('unauthenticated', 'Sign in to continue', 401);

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return errorResponse('bad_request', 'Invalid verification payload', 400);
  }

  const supabase = await createSupabaseServerClient();

  // payments_read RLS scopes this to the caller's own row — a paymentId
  // belonging to someone else comes back as "not found", never "forbidden".
  const { data: payment, error: fetchError } = await supabase
    .from('payments')
    .select('id, status, amount, provider, provider_order_id')
    .eq('id', body.paymentId)
    .maybeSingle();

  if (fetchError) return mapPostgrestError('payments.verify.fetch', fetchError);
  if (!payment || payment.provider !== 'razorpay') {
    return errorResponse('not_found', 'Payment not found', 404);
  }
  if (payment.provider_order_id !== body.razorpay_order_id) {
    return errorResponse('bad_request', 'Order id does not match this payment', 400);
  }

  const provider = getPaymentProvider();

  // Idempotent replay: already captured, either by a double-submit from the
  // client or because the Razorpay webhook beat this request here. Report
  // the current balance without re-verifying or re-crediting anything.
  if (payment.status === 'captured') {
    return NextResponse.json({ ok: true, balance: await currentBalance(supabase, user.id) });
  }
  if (payment.status === 'failed' || payment.status === 'refunded') {
    return errorResponse('conflict', `Payment is ${payment.status} and cannot be verified`, 409);
  }

  // 1. Verify the signature the checkout SDK handed the browser. This is
  //    necessary but never sufficient on its own — it is attacker-supplied
  //    input — a bad signature is rejected outright regardless of anything
  //    Razorpay's API says.
  const signatureOk = provider.verifyCheckoutSignature({
    orderId: body.razorpay_order_id,
    paymentId: body.razorpay_payment_id,
    signature: body.razorpay_signature,
  });
  if (!signatureOk) {
    console.warn('payments.verify: checkout signature mismatch', { paymentId: payment.id });
    return errorResponse('bad_request', 'Payment could not be verified', 400);
  }

  // 2. Independently re-fetch the payment from Razorpay. The client's
  //    success callback is never trusted alone; capture status and amount
  //    are confirmed directly with the PSP.
  let remote: Awaited<ReturnType<typeof provider.fetchPayment>>;
  try {
    remote = await provider.fetchPayment(body.razorpay_payment_id);
  } catch (error) {
    return unexpectedError('payments.verify.fetch-remote', error);
  }

  if (remote.status !== 'captured') {
    return errorResponse('conflict', 'Payment has not been captured yet', 409);
  }
  if (remote.providerOrderId !== body.razorpay_order_id) {
    console.error('payments.verify: SUSPICIOUS order id mismatch between request and Razorpay', {
      paymentId: payment.id,
      expected: body.razorpay_order_id,
      remote: remote.providerOrderId,
    });
    return errorResponse('bad_request', 'Payment could not be verified', 400);
  }
  if (Math.abs(remote.amount - payment.amount) > 0.01) {
    console.error('payments.verify: SUSPICIOUS amount mismatch between our record and Razorpay', {
      paymentId: payment.id,
      expected: payment.amount,
      remote: remote.amount,
    });
    return errorResponse('bad_request', 'Payment could not be verified', 400);
  }

  const admin = createSupabaseAdminClient();

  // Guarded by the status we already read: if a concurrent webhook delivery
  // already moved this payment to 'captured', this update simply matches
  // zero rows. Either writer reaching 'captured' first is fine — both then
  // call credit_wallet_from_payment, which is idempotent.
  const { error: updateError } = await admin
    .from('payments')
    .update({
      status: 'captured',
      provider_payment_id: body.razorpay_payment_id,
      method: remote.method,
      captured_at: new Date().toISOString(),
    })
    .eq('id', payment.id)
    .eq('status', payment.status);
  if (updateError) {
    console.error('payments.verify: failed to mark payment captured', {
      paymentId: payment.id,
      error: updateError.message,
    });
  }

  const { error: creditError } = await admin.rpc('credit_wallet_from_payment', {
    p_payment_id: payment.id,
  });
  if (creditError) {
    return mapPostgrestError('payments.verify.credit', creditError);
  }

  return NextResponse.json({ ok: true, balance: await currentBalance(supabase, user.id) });
}

async function currentBalance(supabase: UserClient, userId: string): Promise<number> {
  const { data } = await supabase.from('wallets').select('balance').eq('user_id', userId).single();
  return data?.balance ?? 0;
}
