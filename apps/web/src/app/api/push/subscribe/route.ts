import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient, getSessionUser } from '@/lib/supabase/server';
import { errorResponse, mapPostgrestError } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

/** Registers (or refreshes) a Web Push subscription for the signed-in user. */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return errorResponse('unauthenticated', 'Sign in to enable push notifications', 401);

  let body: z.infer<typeof subscribeSchema>;
  try {
    body = subscribeSchema.parse(await request.json());
  } catch {
    return errorResponse('bad_request', 'Invalid push subscription payload', 400);
  }

  const supabase = await createSupabaseServerClient();
  const userAgent = request.headers.get('user-agent');

  // push_tokens_own RLS scopes this to the caller's own rows; `endpoint` is
  // unique, so re-subscribing the same browser refreshes the existing row
  // instead of accumulating duplicates.
  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: user.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      user_agent: userAgent,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  );

  if (error) return mapPostgrestError('push.subscribe', error);

  return NextResponse.json({ ok: true }, { status: 201 });
}

/** Removes a Web Push subscription, e.g. on sign-out or permission revoke. */
export async function DELETE(request: Request): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return errorResponse('unauthenticated', 'Sign in to continue', 401);

  let body: z.infer<typeof unsubscribeSchema>;
  try {
    body = unsubscribeSchema.parse(await request.json());
  } catch {
    return errorResponse('bad_request', 'Invalid unsubscribe payload', 400);
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from('push_tokens')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', body.endpoint);

  if (error) return mapPostgrestError('push.unsubscribe', error);

  return NextResponse.json({ ok: true });
}
