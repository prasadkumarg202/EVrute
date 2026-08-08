import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Database, Json } from '@evrute/db/types';
import { AuthError, createSupabaseAdminClient, requireRole } from '@/lib/supabase/server';
import { authErrorResponse, errorResponse, unexpectedError } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ id: z.string().uuid() });

type SettlementUpdate = Database['public']['Tables']['settlements']['Update'];
type SettlementStatus = Database['public']['Enums']['settlement_status'];

/**
 * pending -> approved -> processing only. `processing -> paid` is
 * deliberately NOT reachable from this endpoint: marking a settlement
 * 'paid' asserts that a bank transfer actually happened, and this route has
 * no way to confirm that. That transition belongs exclusively to the
 * payout-provider webhook, which sets `payout_reference` and `paid_at`
 * together once the payout is confirmed. Approving/queuing a settlement
 * here never touches `payout_reference`.
 */
function nextStatusFor(status: SettlementStatus): SettlementStatus | null {
  if (status === 'pending') return 'approved';
  if (status === 'approved') return 'processing';
  return null;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let adminUser: Awaited<ReturnType<typeof requireRole>>;
  try {
    adminUser = await requireRole('admin');
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    return unexpectedError('admin.settlements.process.auth', error);
  }

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return errorResponse('bad_request', 'Invalid settlement id', 400);
  }
  const settlementId = parsedParams.data.id;

  const admin = createSupabaseAdminClient();

  const { data: settlement, error: fetchError } = await admin
    .from('settlements')
    .select('*')
    .eq('id', settlementId)
    .maybeSingle();

  if (fetchError) return unexpectedError('admin.settlements.process.fetch', fetchError);
  if (!settlement) return errorResponse('not_found', 'Settlement not found', 404);

  const nextStatus = nextStatusFor(settlement.status);
  if (!nextStatus) {
    return errorResponse(
      'conflict',
      `Settlement is ${settlement.status} and cannot be advanced by this endpoint`,
      409,
    );
  }

  const updatePayload: SettlementUpdate = {
    status: nextStatus,
    ...(nextStatus === 'approved'
      ? { approved_by: adminUser.id, approved_at: new Date().toISOString() }
      : {}),
  };

  // Optimistic concurrency: only apply if the row is still in the status we
  // just read, so two admins racing to process the same settlement cannot
  // both "successfully" advance it past where the other thinks it is.
  const { data: updated, error: updateError } = await admin
    .from('settlements')
    .update(updatePayload)
    .eq('id', settlementId)
    .eq('status', settlement.status)
    .select('*')
    .maybeSingle();

  if (updateError) return unexpectedError('admin.settlements.process.update', updateError);
  if (!updated) {
    return errorResponse('conflict', 'Settlement status changed concurrently. Reload and retry.', 409);
  }

  const { error: auditError } = await admin.from('audit_log').insert({
    actor_id: adminUser.id,
    actor_role: adminUser.role,
    action: `settlement.${nextStatus}`,
    entity_type: 'settlement',
    entity_id: settlementId,
    before: settlement as unknown as Json,
    after: updated as unknown as Json,
  });
  if (auditError) {
    // The state change already committed; losing the audit trail is bad
    // but must not roll back or re-expose the settlement transition to the
    // caller as a failure.
    console.error('admin.settlements.process: audit log insert failed', {
      settlementId,
      error: auditError.message,
    });
  }

  return NextResponse.json({ settlement: updated });
}
