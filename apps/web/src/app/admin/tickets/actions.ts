'use server';

import { revalidatePath } from 'next/cache';
import { requireRole, createSupabaseServerClient } from '@/lib/supabase/server';
import type { Database } from '@evrute/db/types';
import { fieldErrorsFromIssues, type EntityActionState } from '@/lib/entity-action-state';
import { z } from 'zod';

export interface SimpleActionResult {
  readonly ok: boolean;
  readonly error?: string;
}

type TicketStatus = Database['public']['Enums']['ticket_status'];

export async function setTicketStatusAction(ticketId: string, status: TicketStatus): Promise<SimpleActionResult> {
  await requireRole('admin', 'employee');
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from('tickets')
    .update({
      status,
      resolved_at: status === 'resolved' || status === 'closed' ? new Date().toISOString() : null,
    })
    .eq('id', ticketId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/tickets');
  return { ok: true };
}

export async function assignTicketAction(ticketId: string, assigneeId: string | null): Promise<SimpleActionResult> {
  await requireRole('admin', 'employee');
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from('tickets').update({ assigned_to: assigneeId }).eq('id', ticketId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/tickets');
  return { ok: true };
}

const messageSchema = z.object({
  body: z.string().trim().min(1, 'Write a message before sending.').max(5000, 'Keep it under 5000 characters.'),
});

export async function sendAdminTicketMessageAction(
  ticketId: string,
  isInternal: boolean,
  _prevState: EntityActionState,
  formData: FormData,
): Promise<EntityActionState> {
  const user = await requireRole('admin', 'employee');
  const parsed = messageSchema.safeParse({ body: formData.get('body') });

  if (!parsed.success) {
    return { status: 'error', fieldErrors: fieldErrorsFromIssues(parsed.error.issues) };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('ticket_messages').insert({
    ticket_id: ticketId,
    author_id: user.id,
    body: parsed.data.body,
    is_internal: isInternal,
  });

  if (error) {
    return { status: 'error', fieldErrors: {}, formError: error.message };
  }

  revalidatePath('/admin/tickets');
  return { status: 'success', fieldErrors: {} };
}
