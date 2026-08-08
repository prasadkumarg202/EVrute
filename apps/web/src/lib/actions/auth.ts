'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient, getSessionUser } from '@/lib/supabase/server';

/** Signs the current user out and returns them to the login screen. */
export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export type ProfileFormState =
  | { readonly status: 'idle' }
  | { readonly status: 'success' }
  | { readonly status: 'error'; readonly message: string; readonly field?: string };

const profileSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(1, 'Name cannot be empty')
    .max(80, 'Name must be 80 characters or fewer'),
});

/**
 * Update the caller's own profile.
 *
 * Scoped to `auth.uid()` and nothing else. `role` is deliberately not
 * accepted here — a database trigger rejects self-service role changes, but
 * the field never reaching the query is the first line of defence rather
 * than the last.
 */
export async function updateProfileAction(
  _previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await getSessionUser();
  if (!user) return { status: 'error', message: 'Your session expired. Sign in again.' };

  const parsed = profileSchema.safeParse({ full_name: formData.get('full_name') });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      status: 'error',
      message: issue?.message ?? 'Please check the form',
      ...(issue?.path[0] ? { field: String(issue.path[0]) } : {}),
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: parsed.data.full_name })
    .eq('id', user.id);

  if (error) {
    console.error('account.updateProfile failed', { userId: user.id, error: error.message });
    return { status: 'error', message: 'Could not save your changes. Please try again.' };
  }

  revalidatePath('/account');
  return { status: 'success' };
}
