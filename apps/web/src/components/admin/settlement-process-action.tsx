'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { formatINR } from '@evrute/core';

export function SettlementProcessAction({
  settlementId,
  ownerName,
  netAmount,
}: {
  readonly settlementId: string;
  readonly ownerName: string;
  readonly netAmount: number;
}) {
  const router = useRouter();
  const { push } = useToast();

  return (
    <ConfirmDialog
      trigger={(open) => (
        <Button type="button" size="sm" onClick={open}>
          Process
        </Button>
      )}
      title={`Process payout to ${ownerName}?`}
      description={`This will send ${formatINR(netAmount)} to ${ownerName} and cannot be undone. Only confirm once you've verified the settlement.`}
      confirmLabel="Process payout"
      tone="primary"
      onConfirm={async () => {
        const response = await fetch(`/api/admin/settlements/${settlementId}/process`, { method: 'POST' });
        if (!response.ok) {
          let message = `Could not process the payout (${response.status}).`;
          try {
            const body: unknown = await response.json();
            if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
              message = body.error;
            }
          } catch {
            // Response wasn't JSON — fall back to the generic message.
          }
          throw new Error(message);
        }
        push({ tone: 'success', title: 'Settlement processed' });
        router.refresh();
      }}
    />
  );
}
