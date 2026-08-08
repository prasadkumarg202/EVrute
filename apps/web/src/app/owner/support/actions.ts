'use server';

import { revalidatePath } from 'next/cache';
import { requireRole, createSupabaseServerClient } from '@/lib/supabase/server';
import type { EntityActionState } from '@/lib/entity-action-state';

export async function sendTicketMessageAction(
  ticketId: string,
  _prevState: EntityActionState,
  formData: FormData,
): Promise<EntityActionState> {
  const user = await requireRole('owner', 'admin');

  const body = String(formData.get('body') ?? '').trim();
  if (body.length === 0) {
    return { status: 'error', fieldErrors: { body: 'Write a message before sending.' } };
  }
  if (body.length > 5000) {
    return { status: 'error', fieldErrors: { body: 'Keep messages under 5000 characters.' } };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('ticket_messages').insert({
    ticket_id: ticketId,
    author_id: user.id,
    body,
    is_internal: false,
  });

  if (error) {
    const message =
      error.code === '42501' || error.message.toLowerCase().includes('row-level security')
        ? 'You can only reply on tickets you raised or are assigned to.'
        : error.message;
    return { status: 'error', fieldErrors: {}, formError: message };
  }

  revalidatePath('/owner/support');
  return { status: 'success', fieldErrors: {} };
}
