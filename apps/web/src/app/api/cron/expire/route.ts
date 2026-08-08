import 'server-only';

import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { verifyCronRequest } from '@/lib/server/cron';
import { errorResponse, unexpectedError } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/**
 * Housekeeping run (scheduled every 15 minutes — see vercel.json).
 * Expires reservations and wallet holds past their `expires_at`, freeing
 * the connector and releasing held funds. Cheap and idempotent — an
 * already-expired record is simply not matched again.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    return errorResponse('unauthenticated', 'Unauthorized', 401);
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc('expire_stale_records');
  if (error) {
    return unexpectedError('cron.expire', error);
  }

  const result = data?.[0] ?? { reservations_expired: 0, holds_expired: 0 };
  return NextResponse.json(result);
}
