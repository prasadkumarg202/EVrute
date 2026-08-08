'use server';

import { revalidatePath } from 'next/cache';
import { chargerSchema, connectorSchema } from '@/lib/validation/charger';
import { requireRole, createSupabaseServerClient } from '@/lib/supabase/server';
import { fieldErrorsFromIssues, type EntityActionState } from '@/lib/entity-action-state';

export async function saveChargerAction(
  stationId: string,
  chargerId: string | null,
  _prevState: EntityActionState,
  formData: FormData,
): Promise<EntityActionState> {
  await requireRole('owner', 'admin');
  const parsed = chargerSchema.safeParse({
    label: formData.get('label'),
    vendor: formData.get('vendor'),
    model: formData.get('model'),
    powerKw: formData.get('powerKw'),
    ocppVersion: formData.get('ocppVersion'),
  });

  if (!parsed.success) {
    return { status: 'error', fieldErrors: fieldErrorsFromIssues(parsed.error.issues) };
  }

  const v = parsed.data;
  const supabase = await createSupabaseServerClient();
  const payload = {
    station_id: stationId,
    label: v.label,
    vendor: v.vendor || null,
    model: v.model || null,
    power_kw: v.powerKw,
    ocpp_version: v.ocppVersion,
  };

  const { error } = chargerId
    ? await supabase.from('chargers').update(payload).eq('id', chargerId)
    : await supabase.from('chargers').insert(payload);

  if (error) {
    if (error.code === '23505') {
      return { status: 'error', fieldErrors: { label: 'A charger with this label already exists at this station.' } };
    }
    return { status: 'error', fieldErrors: {}, formError: error.message };
  }

  revalidatePath(`/owner/stations/${stationId}/chargers`);
  return { status: 'success', fieldErrors: {} };
}

export async function saveConnectorAction(
  stationId: string,
  chargerId: string,
  connectorId: string | null,
  _prevState: EntityActionState,
  formData: FormData,
): Promise<EntityActionState> {
  await requireRole('owner', 'admin');
  const parsed = connectorSchema.safeParse({
    connectorNumber: formData.get('connectorNumber'),
    type: formData.get('type'),
    currentType: formData.get('currentType'),
    powerKw: formData.get('powerKw'),
    status: formData.get('status'),
  });

  if (!parsed.success) {
    return { status: 'error', fieldErrors: fieldErrorsFromIssues(parsed.error.issues) };
  }

  const v = parsed.data;
  const supabase = await createSupabaseServerClient();
  const payload = {
    charger_id: chargerId,
    connector_number: v.connectorNumber,
    type: v.type,
    current_type: v.currentType,
    power_kw: v.powerKw,
    status: v.status,
  };

  const { error } = connectorId
    ? await supabase.from('connectors').update(payload).eq('id', connectorId)
    : await supabase.from('connectors').insert(payload);

  if (error) {
    if (error.code === '23505') {
      return { status: 'error', fieldErrors: { connectorNumber: 'This connector number is already used on this charger.' } };
    }
    return { status: 'error', fieldErrors: {}, formError: error.message };
  }

  revalidatePath(`/owner/stations/${stationId}/chargers`);
  return { status: 'success', fieldErrors: {} };
}
