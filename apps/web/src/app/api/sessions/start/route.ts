import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ChargingProviderError } from '@evrute/core/server';
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
  getSessionUser,
} from '@/lib/supabase/server';
import { getChargingProvider } from '@/lib/server/charging';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { errorResponse, mapPostgrestError, unexpectedError } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  connectorId: z.string().uuid(),
  vehicleId: z.string().uuid().optional(),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
  couponCode: z.string().trim().min(1).max(20).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const rate = await checkRateLimit(request, {
    bucket: 'sessions:start',
    limit: 5,
    windowSecs: 60,
  });
  if (!rate.allowed) return rate.response;

  const user = await getSessionUser();
  if (!user) return errorResponse('unauthenticated', 'Sign in to start a charging session', 401);

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return errorResponse('bad_request', 'connectorId is required and must be a valid id', 400);
  }

  const supabase = await createSupabaseServerClient();

  // Runs AS THE USER (not the service role) so RLS and the wallet-hold
  // guard in start_charging_session apply exactly as they would to any
  // other write. The RPC locks the connector, checks spendable balance and
  // places a hold in one transaction — there is no read-then-write race
  // window for the app server to reintroduce.
  const { data: session, error: startError } = await supabase.rpc('start_charging_session', {
    p_connector_id: body.connectorId,
    ...(body.vehicleId !== undefined ? { p_vehicle_id: body.vehicleId } : {}),
    ...(body.idempotencyKey !== undefined ? { p_idempotency_key: body.idempotencyKey } : {}),
    ...(body.couponCode !== undefined ? { p_coupon_code: body.couponCode } : {}),
  });

  if (startError) {
    return mapPostgrestError('sessions.start.rpc', startError);
  }
  if (!session) {
    return unexpectedError('sessions.start.rpc', new Error('start_charging_session returned no row'));
  }

  // Idempotent replay of an existing idempotency key returns whatever
  // session already exists (active/completed/failed) — only a freshly
  // created 'pending' session should ever be sent to the charger.
  if (session.status !== 'pending') {
    return NextResponse.json({ session });
  }

  const { data: connector, error: connectorError } = await supabase
    .from('connectors')
    .select('provider_connector_id')
    .eq('id', body.connectorId)
    .single();

  if (connectorError || !connector) {
    await unwindSession(session.id, 'Connector configuration could not be loaded');
    return unexpectedError(
      'sessions.start.connector-lookup',
      connectorError ?? new Error('connector row missing after start_charging_session succeeded'),
    );
  }

  // Falls back to our own connector id only so the simulator (which does
  // not care about id shape) keeps working when a connector has not been
  // synced from the real provider yet; a real ChargeLab call requires the
  // vendor's own connector id.
  const providerConnectorId = connector.provider_connector_id ?? body.connectorId;

  try {
    const provider = getChargingProvider();
    const ref = await provider.startCharging(providerConnectorId, {
      sessionId: session.id,
      userId: user.id,
      connectorId: providerConnectorId,
    });

    // Persist the provider's session ref immediately so a later webhook
    // (charging_started, meter_values, ...) can resolve it back to this
    // session even if it arrives before we would otherwise have recorded
    // it. activate_session is idempotent — a redelivered webhook that
    // calls it again is a no-op.
    const admin = createSupabaseAdminClient();
    const { data: activated, error: activateError } = await admin.rpc('activate_session', {
      p_session_id: session.id,
      p_provider_ref: ref.providerSessionId,
      ...(ref.startedAt !== undefined ? { p_started_at: ref.startedAt } : {}),
    });

    if (activateError || !activated) {
      console.error('sessions.start: failed to persist provider session ref', {
        sessionId: session.id,
        error: activateError?.message,
      });
      return NextResponse.json({ session: { ...session, provider_session_ref: ref.providerSessionId } }, { status: 201 });
    }

    return NextResponse.json({ session: activated }, { status: 201 });
  } catch (error) {
    // The worst outcome here is a pending session with held funds and no
    // charge flowing. fail_session unwinds the hold and frees the
    // connector in one transaction so that can never linger.
    await unwindSession(
      session.id,
      error instanceof ChargingProviderError ? error.message : 'The charger did not respond. You have not been charged.',
    );
    console.error('sessions.start: provider startCharging failed, session unwound', {
      sessionId: session.id,
      connectorId: body.connectorId,
      error,
    });
    return errorResponse(
      'conflict',
      'The charger could not start your session. You have not been charged.',
      409,
    );
  }
}

async function unwindSession(sessionId: string, message: string): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.rpc('fail_session', {
      p_session_id: sessionId,
      p_message: message,
      p_reason: 'fault',
    });
    if (error) {
      console.error('sessions.start: CRITICAL fail_session RPC returned an error while unwinding', {
        sessionId,
        error: error.message,
      });
    }
  } catch (unwindError) {
    console.error('sessions.start: CRITICAL failed to unwind session after provider failure', {
      sessionId,
      unwindError,
    });
  }
}
