import 'server-only';

import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { verifyCronRequest } from '@/lib/server/cron';
import { errorResponse, unexpectedError } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Daily analytics rollup (scheduled 00:30 UTC — see vercel.json).
 *
 * Recomputes both yesterday and today: yesterday because it is now final,
 * today so a same-day dashboard view is not stuck at zero all day. Both
 * calls are idempotent upserts, so a mid-run failure of one never leaves
 * the other's data outdated.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    return errorResponse('unauthenticated', 'Unauthorized', 401);
  }

  const admin = createSupabaseAdminClient();

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayStr = toDateString(today);

  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = toDateString(yesterday);

  const { error: yesterdayError } = await admin.rpc('rollup_daily_stats', { p_day: yesterdayStr });
  if (yesterdayError) {
    return unexpectedError('cron.rollup.yesterday', yesterdayError);
  }

  const { error: todayError } = await admin.rpc('rollup_daily_stats', { p_day: todayStr });
  if (todayError) {
    return unexpectedError('cron.rollup.today', todayError);
  }

  return NextResponse.json({ ok: true, days: [yesterdayStr, todayStr] });
}
