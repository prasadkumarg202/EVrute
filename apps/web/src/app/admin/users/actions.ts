'use server';

import { revalidatePath } from 'next/cache';
import { requireRole, createSupabaseServerClient } from '@/lib/supabase/server';
import type { AppRole } from '@/lib/supabase/server';

export interface SimpleActionResult {
  readonly ok: boolean;
  readonly error?: string;
}

export async function setUserRoleAction(userId: string, role: AppRole): Promise<SimpleActionResult> {
  const admin = await requireRole('admin');

  if (userId === admin.id) {
    return { ok: false, error: 'You cannot change your own role.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);

  if (error) {
    const message = error.message.toLowerCase().includes('own role')
      ? 'You cannot change your own role.'
      : error.message.toLowerCase().includes('administrator')
        ? 'Only an administrator may change a user role.'
        : error.message;
    return { ok: false, error: message };
  }

  revalidatePath('/admin/users');
  return { ok: true };
}
