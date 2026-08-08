'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Sheet } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { CONNECTOR_TYPES } from '@/lib/validation/charger';
import { connectorTypeLabel } from '@evrute/core';
import { INITIAL_ENTITY_STATE, type EntityActionState } from '@/lib/entity-action-state';
import { toDateInputValue } from '@/lib/utils/format';

type TariffAction = (state: EntityActionState, formData: FormData) => Promise<EntityActionState>;

export function TariffSheetTrigger({ action }: { readonly action: TariffAction }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(action, INITIAL_ENTITY_STATE);
  const { push } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') {
      push({ tone: 'success', title: 'New pricing added' });
      router.refresh();
      setOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const now = toDateInputValue(new Date());

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Add pricing
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Add pricing">
        <form action={formAction} className="flex flex-col gap-4">
          {state.formError && (
            <p role="alert" className="text-sm font-medium text-danger-600">
              {state.formError}
            </p>
          )}
          <div>
            <label htmlFor="connectorType" className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
              Applies to
            </label>
            <select
              id="connectorType"
              name="connectorType"
              defaultValue=""
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3 py-2.5 text-base text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <option value="">All connector types</option>
              {CONNECTOR_TYPES.map((t) => (
                <option key={t} value={t}>
                  {connectorTypeLabel(t)}
                </option>
              ))}
            </select>
          </div>
          <Field
            label="Price per kWh (₹)"
            name="pricePerKwh"
            type="number"
            step="0.01"
            required
            {...(state.fieldErrors.pricePerKwh ? { error: state.fieldErrors.pricePerKwh } : {})}
          />
          <Field label="Session fee (₹)" name="sessionFee" type="number" step="0.01" defaultValue="0" />
          <Field label="Idle fee per minute (₹)" name="idleFeePerMin" type="number" step="0.01" defaultValue="0" />
          <Field label="Minimum balance to start (₹)" name="minBalanceToStart" type="number" step="0.01" defaultValue="100" />
          <Field label="Tax (%)" name="taxPct" type="number" step="0.01" defaultValue="18" />
          <Field
            label="Effective from"
            name="effectiveFrom"
            type="datetime-local"
            required
            defaultValue={`${now}T00:00`}
            hint="The current price for this connector type will end at this moment."
            {...(state.fieldErrors.effectiveFrom ? { error: state.fieldErrors.effectiveFrom } : {})}
          />
          <Button type="submit" loading={isPending} fullWidth>
            Save pricing
          </Button>
        </form>
      </Sheet>
    </>
  );
}
