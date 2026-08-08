'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Enums } from '@evrute/db';
import { createSupabaseServerClient, getSessionUser } from '@/lib/supabase/server';

const CONNECTOR_TYPES = ['CCS2', 'TYPE2', 'GBT', 'CHADEMO', 'AC_3PIN'] as const satisfies readonly Enums<'connector_type'>[];

const vehicleSchema = z.object({
  make: z.string().trim().min(1, 'Enter a make').max(60),
  model: z.string().trim().min(1, 'Enter a model').max(60),
  nickname: z.string().trim().max(40).optional(),
  plateNumber: z
    .string()
    .trim()
    .max(15)
    .regex(/^[A-Z0-9 -]{4,15}$/, 'Use letters, numbers, spaces or hyphens only')
    .optional()
    .or(z.literal('')),
  connectorType: z.enum(CONNECTOR_TYPES),
  batteryCapacityKwh: z.coerce.number().positive().max(500),
  maxChargeRateKw: z.coerce.number().positive().max(500).optional().or(z.nan()),
});

export interface VehicleFormState {
  readonly ok: boolean;
  readonly error?: string;
}

function normalizeMaxChargeRate(value: number | undefined): number | null {
  return value == null || Number.isNaN(value) ? null : value;
}

function parseVehicleForm(formData: FormData) {
  const maxChargeRaw = formData.get('maxChargeRateKw');
  return vehicleSchema.safeParse({
    make: formData.get('make'),
    model: formData.get('model'),
    nickname: formData.get('nickname') || undefined,
    plateNumber: formData.get('plateNumber') || '',
    connectorType: formData.get('connectorType'),
    batteryCapacityKwh: formData.get('batteryCapacityKwh'),
    maxChargeRateKw: maxChargeRaw ? Number(maxChargeRaw) : Number.NaN,
  });
}

export async function addVehicle(_prev: VehicleFormState, formData: FormData): Promise<VehicleFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'Sign in to add a vehicle.' };

  const parsed = parseVehicleForm(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('vehicles').insert({
    user_id: user.id,
    make: parsed.data.make,
    model: parsed.data.model,
    nickname: parsed.data.nickname || null,
    plate_number: parsed.data.plateNumber || null,
    connector_type: parsed.data.connectorType,
    battery_capacity_kwh: parsed.data.batteryCapacityKwh,
    max_charge_rate_kw: normalizeMaxChargeRate(parsed.data.maxChargeRateKw),
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath('/vehicles');
  return { ok: true };
}

export async function updateVehicle(
  vehicleId: string,
  _prev: VehicleFormState,
  formData: FormData,
): Promise<VehicleFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'Sign in to update this vehicle.' };

  const parsed = parseVehicleForm(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('vehicles')
    .update({
      make: parsed.data.make,
      model: parsed.data.model,
      nickname: parsed.data.nickname || null,
      plate_number: parsed.data.plateNumber || null,
      connector_type: parsed.data.connectorType,
      battery_capacity_kwh: parsed.data.batteryCapacityKwh,
      max_charge_rate_kw: normalizeMaxChargeRate(parsed.data.maxChargeRateKw),
    })
    .eq('id', vehicleId)
    .eq('user_id', user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/vehicles');
  return { ok: true };
}

export async function deleteVehicle(vehicleId: string): Promise<{ readonly ok: boolean; readonly error?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'Sign in to remove this vehicle.' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('vehicles').delete().eq('id', vehicleId).eq('user_id', user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/vehicles');
  return { ok: true };
}

export async function setPrimaryVehicle(vehicleId: string): Promise<{ readonly ok: boolean; readonly error?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'Sign in to update this vehicle.' };

  const supabase = await createSupabaseServerClient();
  // Clear any existing primary first — the DB enforces at most one primary
  // per user via a partial unique index, so a naive single UPDATE that sets
  // this vehicle to primary without clearing the old one would violate it.
  const { error: clearError } = await supabase
    .from('vehicles')
    .update({ is_primary: false })
    .eq('user_id', user.id)
    .eq('is_primary', true);
  if (clearError) return { ok: false, error: clearError.message };

  const { error } = await supabase
    .from('vehicles')
    .update({ is_primary: true })
    .eq('id', vehicleId)
    .eq('user_id', user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/vehicles');
  return { ok: true };
}
