import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getChargingProvider } from '@/lib/server/charging';
import { errorResponse, mapPostgrestError } from '@/lib/server/http';
import { createSupabaseServerClient, getSessionUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ id: z.string().uuid() });

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return errorResponse('unauthenticated', 'Sign in to stop a charging session', 401);

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return errorResponse('bad_request', 'Invalid session id', 400);
  }
  const sessionId = parsedParams.data.id;

  const supabase = await createSupabaseServerClient();

  // RLS (sessions_read) already scopes this to sessions the caller owns,
  // owns the station of, or has staff access to — a session that exists
  // but belongs to someone else comes back as "not found", not "forbidden",
  // which is the correct thing to leak to an unrelated caller.
  const { data: session, error: fetchError } = await supabase
    .from('sessions')
    .select('id, status, provider_session_ref')
    .eq('id', sessionId)
    .maybeSingle();

  if (fetchError) {
    return mapPostgrestError('sessions.stop.fetch', fetchError);
  }
  if (!session) {
    return errorResponse('not_found', 'Session not found', 404);
  }

  // Idempotent: a session that is already closed is returned as-is rather
  // than re-run through the provider and the ledger a second time.
  if (TERMINAL_STATUSES.has(session.status)) {
    return NextResponse.json({ session });
  }

  if (session.provider_session_ref) {
    try {
      const provider = getChargingProvider();
      await provider.stopCharging({ providerSessionId: session.provider_session_ref });
    } catch (error) {
      // Best-effort: the charger may already have stopped on its own (EV
      // disconnected, provider-side timeout, ...), and the ledger close-out
      // below must happen regardless of whether the RemoteStop round trip
      // succeeds — a customer must always be able to end a session and get
      // billed for exactly what was delivered.
      console.warn('sessions.stop: provider stopCharging failed, continuing to close the session', {
        sessionId,
        error,
      });
    }
  }

  // Granted to `authenticated`; the function re-derives the caller from
  // auth.uid() and enforces ownership/staff itself, so this call carries
  // the same guarantee an RLS policy would.
  const { data: stopped, error: stopError } = await supabase.rpc('stop_charging_session', {
    p_session_id: sessionId,
    p_reason: 'user_request',
  });

  if (stopError) {
    return mapPostgrestError('sessions.stop.rpc', stopError);
  }

  return NextResponse.json({ session: stopped });
}
