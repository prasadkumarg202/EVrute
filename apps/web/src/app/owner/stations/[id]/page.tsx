import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { StationForm } from '@/components/forms/station-form';
import { FlashToast } from '@/components/flash-toast';
import { updateStationAction } from '@/app/owner/stations/actions';
import type { StationActionState } from '@/lib/validation/station';
import { requireRole, createSupabaseServerClient } from '@/lib/supabase/server';
import { Badge, Card, CardBody } from '@/components/ui';
import { presentStatus, STATION_STATUS } from '@evrute/core';

export const metadata: Metadata = { title: 'Edit station' };

export default async function EditStationPage({ params }: { readonly params: Promise<{ id: string }> }) {
  await requireRole('owner', 'admin');
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: station } = await supabase.from('stations').select('*').eq('id', id).single();
  if (!station) notFound();

  const boundAction = updateStationAction.bind(null, id) as (
    state: StationActionState,
    formData: FormData,
  ) => Promise<StationActionState>;

  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={null}>
        <FlashToast param="saved" title="Station saved" />
      </Suspense>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[var(--text-primary)]">{station.name}</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Edit station details.</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/owner/stations/${id}/chargers`}
            className="inline-flex h-10 items-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
          >
            Chargers
          </Link>
          <Link
            href={`/owner/stations/${id}/pricing`}
            className="inline-flex h-10 items-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
          >
            Pricing
          </Link>
        </div>
      </div>

      {station.status === 'suspended' ? (
        <Card>
          <CardBody className="flex flex-col items-start gap-2">
            <Badge tone={presentStatus(STATION_STATUS, 'suspended').tone}>
              {presentStatus(STATION_STATUS, 'suspended').label}
            </Badge>
            <p className="text-sm text-[var(--text-secondary)]">
              This station has been suspended by EVRute. Editing is disabled until an administrator lifts the
              suspension — contact support if you believe this is a mistake.
            </p>
          </CardBody>
        </Card>
      ) : (
        <StationForm
          action={boundAction}
          submitLabel="Save changes"
          initialValues={{
            name: station.name,
            slug: station.slug,
            description: station.description ?? '',
            addressLine1: station.address_line1,
            addressLine2: station.address_line2 ?? '',
            city: station.city,
            state: station.state,
            postalCode: station.postal_code ?? '',
            lat: String(station.lat),
            lng: String(station.lng),
            amenities: station.amenities,
            is24x7: station.is_24x7,
            openTime: station.open_time?.slice(0, 5) ?? '',
            closeTime: station.close_time?.slice(0, 5) ?? '',
            status: station.status,
          }}
        />
      )}
    </div>
  );
}
