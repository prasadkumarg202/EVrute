import type { Metadata } from 'next';
import { StationForm } from '@/components/forms/station-form';
import { createStationAction } from '@/app/owner/stations/actions';
import { requireRole } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Add station' };

const EMPTY_VALUES = {
  name: '',
  slug: '',
  description: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  lat: '',
  lng: '',
  amenities: [],
  is24x7: true,
  openTime: '',
  closeTime: '',
  status: 'draft',
};

export default async function NewStationPage() {
  await requireRole('owner', 'admin');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--text-primary)]">Add a station</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          New stations start as a draft. Submit for review once the chargers and pricing are set up.
        </p>
      </div>
      <StationForm action={createStationAction} initialValues={EMPTY_VALUES} submitLabel="Create station" />
    </div>
  );
}
