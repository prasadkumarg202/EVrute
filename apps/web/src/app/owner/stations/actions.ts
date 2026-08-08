'use server';

import { redirect } from 'next/navigation';
import { stationSchema, type StationActionState, type StationFieldErrors } from '@/lib/validation/station';
import { requireRole } from '@/lib/supabase/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

function parseForm(formData: FormData) {
  return stationSchema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug'),
    description: formData.get('description'),
    addressLine1: formData.get('addressLine1'),
    addressLine2: formData.get('addressLine2'),
    city: formData.get('city'),
    state: formData.get('state'),
    postalCode: formData.get('postalCode'),
    lat: formData.get('lat'),
    lng: formData.get('lng'),
    amenities: formData.getAll('amenities'),
    is24x7: formData.get('is24x7') === 'on',
    openTime: formData.get('openTime'),
    closeTime: formData.get('closeTime'),
    status: formData.get('status'),
  });
}

function fieldErrorsFrom(issues: { path: (string | number)[]; message: string }[]): StationFieldErrors {
  const errors: StationFieldErrors = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !(key in errors)) {
      (errors as Record<string, string>)[key] = issue.message;
    }
  }
  return errors;
}

export async function createStationAction(
  _prevState: StationActionState,
  formData: FormData,
): Promise<StationActionState> {
  const user = await requireRole('owner', 'admin');
  const parsed = parseForm(formData);

  if (!parsed.success) {
    return { status: 'error', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const v = parsed.data;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('stations')
    .insert({
      owner_id: user.id,
      name: v.name,
      slug: v.slug,
      description: v.description || null,
      address_line1: v.addressLine1,
      address_line2: v.addressLine2 || null,
      city: v.city,
      state: v.state,
      postal_code: v.postalCode,
      lat: v.lat,
      lng: v.lng,
      amenities: v.amenities,
      is_24x7: v.is24x7,
      open_time: v.is24x7 ? null : v.openTime || null,
      close_time: v.is24x7 ? null : v.closeTime || null,
      status: v.status,
    })
    .select('id')
    .single();

  if (error || !data) {
    if (error?.code === '23505') {
      return { status: 'error', fieldErrors: { slug: 'That slug is already taken — try another.' } };
    }
    return { status: 'error', fieldErrors: {}, formError: error?.message ?? 'Could not create the station.' };
  }

  redirect(`/owner/stations/${data.id}?saved=1`);
}

export async function updateStationAction(
  stationId: string,
  _prevState: StationActionState,
  formData: FormData,
): Promise<StationActionState> {
  await requireRole('owner', 'admin');
  const parsed = parseForm(formData);

  if (!parsed.success) {
    return { status: 'error', fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const v = parsed.data;
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from('stations')
    .update({
      name: v.name,
      slug: v.slug,
      description: v.description || null,
      address_line1: v.addressLine1,
      address_line2: v.addressLine2 || null,
      city: v.city,
      state: v.state,
      postal_code: v.postalCode,
      lat: v.lat,
      lng: v.lng,
      amenities: v.amenities,
      is_24x7: v.is24x7,
      open_time: v.is24x7 ? null : v.openTime || null,
      close_time: v.is24x7 ? null : v.closeTime || null,
      status: v.status,
    })
    .eq('id', stationId);

  if (error) {
    if (error.code === '23505') {
      return { status: 'error', fieldErrors: { slug: 'That slug is already taken — try another.' } };
    }
    return { status: 'error', fieldErrors: {}, formError: error.message };
  }

  redirect(`/owner/stations/${stationId}?saved=1`);
}
