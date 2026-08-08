import 'server-only';

import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { verifyCronRequest } from '@/lib/server/cron';
import { errorResponse, unexpectedError } from '@/lib/server/http';
import { serverEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

interface SettlementResult {
  readonly ownerId: string;
  readonly settlementId?: string;
  readonly error?: string;
}

function toDateString(date: Date): string {
  const iso = date.toISOString();
  return iso.slice(0, 10);
}

/**
 * Weekly settlement run (scheduled Monday 02:00 UTC — see vercel.json).
 * Settles the 7-day window that just ended: for every owner with at least
 * one completed session in that window, calls `generate_settlement` with
 * the platform's configured GST/TDS rates. The RPC is idempotent per
 * (owner, period) — re-running this job for the same week is a no-op for
 * any settlement that already left 'pending'.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    return errorResponse('unauthenticated', 'Unauthorized', 401);
  }

  const admin = createSupabaseAdminClient();
  const { PLATFORM_GST_PCT, PLATFORM_TDS_PCT } = serverEnv();

  const now = new Date();
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const periodStart = new Date(periodEnd);
  periodStart.setUTCDate(periodStart.getUTCDate() - 6);
  const rangeEndExclusive = new Date(periodEnd);
  rangeEndExclusive.setUTCDate(rangeEndExclusive.getUTCDate() + 1);

  const periodStartStr = toDateString(periodStart);
  const periodEndStr = toDateString(periodEnd);

  const { data: sessionRows, error: sessionsError } = await admin
    .from('sessions')
    .select('station_id')
    .eq('status', 'completed')
    .gte('stopped_at', `${periodStartStr}T00:00:00.000Z`)
    .lt('stopped_at', rangeEndExclusive.toISOString());

  if (sessionsError) {
    return unexpectedError('cron.settlements.sessions', sessionsError);
  }

  const stationIds = [...new Set((sessionRows ?? []).map((row) => row.station_id))];

  if (stationIds.length === 0) {
    return NextResponse.json({
      periodStart: periodStartStr,
      periodEnd: periodEndStr,
      ownersProcessed: 0,
      results: [] satisfies SettlementResult[],
    });
  }

  const { data: stationRows, error: stationsError } = await admin
    .from('stations')
    .select('owner_id')
    .in('id', stationIds);

  if (stationsError) {
    return unexpectedError('cron.settlements.stations', stationsError);
  }

  // stations.owner_id is nullable since imported (non-EVRute) stations have
  // no owner; sessions only ever exist against owner-operated stations, but
  // the type no longer guarantees that, so drop any null defensively.
  const ownerIds = [
    ...new Set(
      (stationRows ?? [])
        .map((row) => row.owner_id)
        .filter((id): id is string => id !== null),
    ),
  ];
  const results: SettlementResult[] = [];

  for (const ownerId of ownerIds) {
    const { data: settlement, error } = await admin.rpc('generate_settlement', {
      p_owner_id: ownerId,
      p_period_start: periodStartStr,
      p_period_end: periodEndStr,
      p_gst_pct: PLATFORM_GST_PCT,
      p_tds_pct: PLATFORM_TDS_PCT,
    });

    if (error) {
      console.error('cron.settlements: generate_settlement failed', { ownerId, error: error.message });
      results.push({ ownerId, error: error.message });
      continue;
    }
    if (!settlement) {
      results.push({ ownerId, error: 'generate_settlement returned no row' });
      continue;
    }
    results.push({ ownerId, settlementId: settlement.id });
  }

  return NextResponse.json({
    periodStart: periodStartStr,
    periodEnd: periodEndStr,
    ownersProcessed: ownerIds.length,
    results,
  });
}
