'use server';

import { revalidatePath } from 'next/cache';
import { requireRole, createSupabaseServerClient } from '@/lib/supabase/server';
import type { EntityActionState } from '@/lib/entity-action-state';

export async function replyToReviewAction(
  reviewId: string,
  _prevState: EntityActionState,
  formData: FormData,
): Promise<EntityActionState> {
  await requireRole('owner', 'admin');

  const reply = String(formData.get('reply') ?? '').trim();
  if (reply.length === 0) {
    return { status: 'error', fieldErrors: { reply: 'Write a reply before sending.' } };
  }
  if (reply.length > 2000) {
    return { status: 'error', fieldErrors: { reply: 'Keep replies under 2000 characters.' } };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('reviews')
    .update({ owner_reply: reply, replied_at: new Date().toISOString() })
    .eq('id', reviewId);

  if (error) {
    return { status: 'error', fieldErrors: {}, formError: error.message };
  }

  revalidatePath('/owner/reviews');
  return { status: 'success', fieldErrors: {} };
}
