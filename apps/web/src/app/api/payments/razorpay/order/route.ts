import 'server-only';

import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdminClient, getSessionUser } from '@/lib/supabase/server';
import { getPaymentProvider } from '@/lib/server/payments';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { errorResponse, unexpectedError } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  amount: z
    .number()
    .min(100, 'Minimum top-up is Rs 100')
    .max(50000, 'Maximum top-up is Rs 50,000'),
});

export async function POST(request: Request): Promise<NextResponse> {
  const rate = await checkRateLimit(request, {
    bucket: 'payments:order',
    limit: 10,
    windowSecs: 60,
  });
  if (!rate.allowed) return rate.response;

  const user = await getSessionUser();
  if (!user) return errorResponse('unauthenticated', 'Sign in to add money to your wallet', 401);

  // Fail here, not after the Razorpay order exists. Recording the payment
  // needs the service role (the `payments` table has no INSERT grant for
  // `authenticated`), so without it we would create a real order at Razorpay
  // with nothing in our database to redeem it against.
  try {
    createSupabaseAdminClient();
  } catch (error) {
    console.error('payments.order: service role not configured', {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(
      'not_configured',
      'Payments are not configured on this server. SUPABASE_SERVICE_ROLE_KEY is missing.',
      503,
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return errorResponse('bad_request', 'amount must be a number between 100 and 50000', 400);
  }

  // Our own id, generated before either side exists, so it can be the
  // Razorpay order's `receipt` (correlating the two) and the payments row's
  // primary key at once.
  const paymentId = randomUUID();
  const provider = getPaymentProvider();

  let order: Awaited<ReturnType<typeof provider.createOrder>>;
  try {
    order = await provider.createOrder({
      amount: body.amount,
      currency: 'INR',
      referenceId: paymentId,
      userId: user.id,
    });
  } catch (error) {
    return unexpectedError('payments.order.create', error);
  }

  // payments has no INSERT grant for `authenticated` (0011_harden_privileges.sql)
  // — every write goes through this server route, gated by the auth and
  // rate-limit checks above, never directly by the client.
  const admin = createSupabaseAdminClient();
  const { data: payment, error: insertError } = await admin
    .from('payments')
    .insert({
      id: paymentId,
      user_id: user.id,
      provider: 'razorpay',
      provider_order_id: order.providerOrderId,
      amount: body.amount,
      status: 'created',
      purpose: 'wallet_recharge',
      idempotency_key: `wallet-recharge:${paymentId}`,
    })
    .select('id')
    .single();

  if (insertError || !payment) {
    // The Razorpay order now exists with nothing in our database to redeem
    // it against. There is no cancel-order API to unwind it — unused
    // orders simply expire on Razorpay's side — so this is logged loudly
    // for manual reconciliation rather than silently swallowed.
    console.error('payments.order: CRITICAL order created at Razorpay but payments row insert failed', {
      paymentId,
      providerOrderId: order.providerOrderId,
      error: insertError?.message,
    });
    return unexpectedError('payments.order.persist', insertError ?? new Error('insert returned no row'));
  }

  return NextResponse.json({ paymentId: payment.id, checkout: order.checkout }, { status: 201 });
}
