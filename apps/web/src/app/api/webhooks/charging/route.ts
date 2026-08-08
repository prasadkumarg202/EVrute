import 'server-only';

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProviderWebhookEvent } from '@evrute/core';
import type { Database } from '@evrute/db/types';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { getChargingProvider } from '@/lib/server/charging';
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
  // Header name is vendor-specific; ChargeLab signs with `x-chargelab-signature`.
  // A future eDRV adapter would need its own header here alongside its own
  // route, or this route generalised to accept either.
  const signature =
    request.headers.get('x-chargelab-signature') ?? request.headers.get('x-webhook-signature');

  const provider = getChargingProvider();

  // Verify FIRST, before anything else touches the database.
  if (!provider.verifyWebhookSignature(rawBody, signature)) {
    console.warn('webhooks.charging: signature verification failed');
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
    // Unrecognised shape: acknowledge so the provider stops retrying rather
    // than hammering us with a payload we will never understand.
    console.warn('webhooks.charging: unrecognised payload shape');
    return NextResponse.json({ ok: true });
  }

  const admin = createSupabaseAdminClient();
  const record = await recordWebhookEvent(admin, {
    source: 'charging_provider',
    eventId: event.eventId,
    eventType: event.type,
    payload,
    signature,
  });

  if (record.alreadyProcessed) {
    return NextResponse.json({ ok: true });
  }

  try {
    await processChargingEvent(admin, event);
    await markWebhookProcessed(admin, record.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('webhooks.charging: processing failed', {
      eventId: event.eventId,
      type: event.type,
      error,
    });
    await markWebhookFailed(admin, record.id, message);
    // Still 200: the event is durably recorded (with last_error set) for
    // manual replay. A 500 here would make the provider retry forever.
  }

  return NextResponse.json({ ok: true });
}

async function processChargingEvent(admin: AdminClient, event: ProviderWebhookEvent): Promise<void> {
  switch (event.type) {
    case 'charging_started': {
      const sessionId = await findSessionIdByProviderRef(admin, event.providerSessionId);
      if (!sessionId) {
        console.warn('webhooks.charging: charging_started for unknown session ref', {
          providerSessionId: event.providerSessionId,
        });
        return;
      }
      const { error } = await admin.rpc('activate_session', {
        p_session_id: sessionId,
        ...(event.providerSessionId !== undefined ? { p_provider_ref: event.providerSessionId } : {}),
        p_started_at: event.occurredAt,
      });
      if (error) throw new Error(`activate_session failed: ${error.message}`);
      return;
    }

    case 'meter_values': {
      const sessionId = await findSessionIdByProviderRef(admin, event.providerSessionId);
      if (!sessionId || !event.meterValue) {
        console.warn('webhooks.charging: meter_values missing session ref or meter value', {
          providerSessionId: event.providerSessionId,
        });
        return;
      }
      const { error } = await admin.rpc('record_meter_reading', {
        p_session_id: sessionId,
        p_recorded_at: event.meterValue.recordedAt,
        p_energy_kwh: event.meterValue.energyKwh,
        ...(event.meterValue.powerKw !== undefined ? { p_power_kw: event.meterValue.powerKw } : {}),
        ...(event.meterValue.socPct !== undefined ? { p_soc_pct: event.meterValue.socPct } : {}),
      });
      if (error) throw new Error(`record_meter_reading failed: ${error.message}`);
      return;
    }

    case 'charging_stopped': {
      const sessionId = await findSessionIdByProviderRef(admin, event.providerSessionId);
      if (!sessionId) {
        console.warn('webhooks.charging: charging_stopped for unknown session ref', {
          providerSessionId: event.providerSessionId,
        });
        return;
      }
      const { error } = await admin.rpc('stop_charging_session', {
        p_session_id: sessionId,
        p_reason: 'provider_stopped',
        ...(event.meterValue ? { p_final_energy_kwh: event.meterValue.energyKwh } : {}),
        p_stopped_at: event.occurredAt,
      });
      if (error) throw new Error(`stop_charging_session failed: ${error.message}`);
      return;
    }

    case 'charging_failed': {
      const sessionId = await findSessionIdByProviderRef(admin, event.providerSessionId);
      if (!sessionId) {
        console.warn('webhooks.charging: charging_failed for unknown session ref', {
          providerSessionId: event.providerSessionId,
        });
        return;
      }
      const { error } = await admin.rpc('fail_session', {
        p_session_id: sessionId,
        p_message: event.message ?? 'The charger reported a failure and stopped the session.',
        p_reason: 'fault',
      });
      if (error) throw new Error(`fail_session failed: ${error.message}`);
      return;
    }

    case 'fault_detected': {
      await handleFaultDetected(admin, event);
      return;
    }

    case 'connector_online':
    case 'connector_offline': {
      await handleConnectorConnectivity(admin, event);
      return;
    }

    case 'reservation_expired': {
      await handleReservationExpired(admin, event);
      return;
    }

    case 'firmware_updated': {
      if (!event.providerChargerId) {
        console.warn('webhooks.charging: firmware_updated missing provider charger id');
        return;
      }
      if (!event.message) {
        console.warn('webhooks.charging: firmware_updated missing version in message field', {
          providerChargerId: event.providerChargerId,
        });
        return;
      }
      const { error } = await admin
        .from('chargers')
        .update({ firmware_version: event.message })
        .eq('provider_charger_id', event.providerChargerId);
      if (error) throw new Error(`chargers firmware update failed: ${error.message}`);
      return;
    }

    case 'payment_required': {
      const session = await findSessionByProviderRef(admin, event.providerSessionId);
      if (!session) {
        console.warn('webhooks.charging: payment_required for unknown session ref', {
          providerSessionId: event.providerSessionId,
        });
        return;
      }
      const { error } = await admin.from('notifications').insert({
        user_id: session.user_id,
        type: 'payment_required',
        title: 'Payment needed to continue charging',
        body: event.message ?? 'Your charging session needs a payment method to continue.',
        data: { session_id: session.id },
      });
      if (error) throw new Error(`payment_required notification failed: ${error.message}`);
      return;
    }

    default: {
      const exhaustive: never = event.type;
      console.warn('webhooks.charging: unhandled event type', { type: String(exhaustive) });
    }
  }
}

async function findSessionByProviderRef(
  admin: AdminClient,
  providerSessionId: string | undefined,
): Promise<{ id: string; user_id: string } | null> {
  if (!providerSessionId) return null;
  const { data, error } = await admin
    .from('sessions')
    .select('id, user_id')
    .eq('provider_session_ref', providerSessionId)
    .maybeSingle();
  if (error) throw new Error(`session lookup by provider ref failed: ${error.message}`);
  return data;
}

async function findSessionIdByProviderRef(
  admin: AdminClient,
  providerSessionId: string | undefined,
): Promise<string | null> {
  const session = await findSessionByProviderRef(admin, providerSessionId);
  return session?.id ?? null;
}

async function handleFaultDetected(admin: AdminClient, event: ProviderWebhookEvent): Promise<void> {
  if (!event.providerChargerId) {
    console.warn('webhooks.charging: fault_detected missing provider charger id');
    return;
  }

  const { data: charger, error: chargerError } = await admin
    .from('chargers')
    .update({ status: 'faulted' })
    .eq('provider_charger_id', event.providerChargerId)
    .select('id, station_id')
    .maybeSingle();
  if (chargerError) throw new Error(`charger fault update failed: ${chargerError.message}`);
  if (!charger) {
    console.warn('webhooks.charging: fault_detected for unknown charger ref', {
      providerChargerId: event.providerChargerId,
    });
    return;
  }

  if (event.providerConnectorId) {
    const { error: connectorError } = await admin
      .from('connectors')
      .update({ status: 'faulted', last_error_code: event.errorCode ?? null })
      .eq('provider_connector_id', event.providerConnectorId);
    if (connectorError) throw new Error(`connector fault update failed: ${connectorError.message}`);
  }

  const { data: station, error: stationError } = await admin
    .from('stations')
    .select('owner_id')
    .eq('id', charger.station_id)
    .single();
  if (stationError) throw new Error(`station lookup for fault notification failed: ${stationError.message}`);

  const { data: admins, error: adminsError } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'admin');
  if (adminsError) throw new Error(`admin lookup for fault notification failed: ${adminsError.message}`);

  // stations.owner_id is nullable since imported (non-EVRute) stations have
  // no owner; a charger fault only ever fires for an owner-operated station,
  // but the type no longer guarantees that, so drop it defensively if null.
  const recipientIds = new Set<string>([
    ...(station.owner_id ? [station.owner_id] : []),
    ...(admins ?? []).map((a) => a.id),
  ]);
  const body =
    event.message ?? `Charger reported a fault${event.errorCode ? ` (${event.errorCode})` : ''}.`;

  const { error: notifyError } = await admin.from('notifications').insert(
    [...recipientIds].map((userId) => ({
      user_id: userId,
      type: 'charger_fault',
      title: 'Charger fault detected',
      body,
      data: { charger_id: charger.id, error_code: event.errorCode ?? null },
    })),
  );
  if (notifyError) throw new Error(`fault notification insert failed: ${notifyError.message}`);
}

async function handleConnectorConnectivity(admin: AdminClient, event: ProviderWebhookEvent): Promise<void> {
  if (!event.providerConnectorId) {
    console.warn('webhooks.charging: connector connectivity event missing provider connector id', {
      type: event.type,
    });
    return;
  }

  if (event.type === 'connector_offline') {
    const { error } = await admin
      .from('connectors')
      .update({ status: 'offline' })
      .eq('provider_connector_id', event.providerConnectorId);
    if (error) throw new Error(`connector offline update failed: ${error.message}`);
    return;
  }

  // Coming back online must never clobber a connector that is mid-session
  // (occupied) or reserved — only a connector that was offline or faulted
  // recovers to available.
  const { error } = await admin
    .from('connectors')
    .update({ status: 'available' })
    .eq('provider_connector_id', event.providerConnectorId)
    .in('status', ['offline', 'faulted']);
  if (error) throw new Error(`connector online update failed: ${error.message}`);
}

async function handleReservationExpired(admin: AdminClient, event: ProviderWebhookEvent): Promise<void> {
  if (!event.providerConnectorId) {
    console.warn('webhooks.charging: reservation_expired missing provider connector id');
    return;
  }

  const { data: connector, error: connectorError } = await admin
    .from('connectors')
    .select('id')
    .eq('provider_connector_id', event.providerConnectorId)
    .maybeSingle();
  if (connectorError) throw new Error(`connector lookup for reservation expiry failed: ${connectorError.message}`);
  if (!connector) {
    console.warn('webhooks.charging: reservation_expired for unknown connector ref', {
      providerConnectorId: event.providerConnectorId,
    });
    return;
  }

  const { data: reservation, error: reservationError } = await admin
    .from('reservations')
    .update({ status: 'expired' })
    .eq('connector_id', connector.id)
    .in('status', ['pending', 'active'])
    .select('id')
    .maybeSingle();
  if (reservationError) throw new Error(`reservation expiry update failed: ${reservationError.message}`);
  if (!reservation) {
    console.warn('webhooks.charging: reservation_expired but no live reservation found', {
      connectorId: connector.id,
    });
  }

  const { error: freeError } = await admin
    .from('connectors')
    .update({ status: 'available' })
    .eq('id', connector.id)
    .eq('status', 'reserved');
  if (freeError) throw new Error(`connector free-up after reservation expiry failed: ${freeError.message}`);
}
