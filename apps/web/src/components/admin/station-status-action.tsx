'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { setStationStatusAction } from '@/app/admin/stations/actions';

export function StationStatusAction({
  stationId,
  stationName,
  currentStatus,
}: {
  readonly stationId: string;
  readonly stationName: string;
  readonly currentStatus: string;
}) {
  const router = useRouter();
  const { push } = useToast();

  if (currentStatus === 'suspended') {
    return (
      <ConfirmDialog
        trigger={(open) => (
          <Button type="button" variant="secondary" size="sm" onClick={open}>
            Reactivate
          </Button>
        )}
        title={`Reactivate ${stationName}?`}
        description="This station will become visible and bookable again."
        confirmLabel="Reactivate"
        tone="primary"
        onConfirm={async () => {
          const result = await setStationStatusAction(stationId, 'active');
          if (!result.ok) throw new Error(result.error ?? 'Could not reactivate the station.');
          push({ tone: 'success', title: 'Station reactivated' });
          router.refresh();
        }}
      />
    );
  }

  return (
    <ConfirmDialog
      trigger={(open) => (
        <Button type="button" variant="danger" size="sm" onClick={open}>
          Suspend
        </Button>
      )}
      title={`Suspend ${stationName}?`}
      description="Drivers will no longer be able to find or start sessions at this station until it's reactivated."
      confirmLabel="Suspend station"
      tone="danger"
      onConfirm={async () => {
        const result = await setStationStatusAction(stationId, 'suspended');
        if (!result.ok) throw new Error(result.error ?? 'Could not suspend the station.');
        push({ tone: 'success', title: 'Station suspended' });
        router.refresh();
      }}
    />
  );
}
