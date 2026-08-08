'use server';

import { revalidatePath } from 'next/cache';
import { requireRole, createSupabaseServerClient } from '@/lib/supabase/server';

export interface SimpleActionResult {
  readonly ok: boolean;
  readonly error?: string;
}

export async function setStationStatusAction(
  stationId: string,
  status: 'active' | 'suspended',
): Promise<SimpleActionResult> {
  await requireRole('admin');
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from('stations').update({ status }).eq('id', stationId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/stations');
  return { ok: true };
}
