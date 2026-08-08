'use client';

import { useActionState, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Sheet } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import {
  CONNECTOR_TYPES,
  CURRENT_TYPES,
  OCPP_VERSIONS,
  OWNER_SETTABLE_CONNECTOR_STATUS,
} from '@/lib/validation/charger';
import { connectorTypeLabel, presentStatus, CONNECTOR_STATUS } from '@evrute/core';
import { INITIAL_ENTITY_STATE, type EntityActionState } from '@/lib/entity-action-state';

type EntityAction = (state: EntityActionState, formData: FormData) => Promise<EntityActionState>;

function useEntitySheet(action: EntityAction, successMessage: string, onSuccessClose: () => void) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ENTITY_STATE);
  const { push } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') {
      push({ tone: 'success', title: successMessage });
      router.refresh();
      onSuccessClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return { state, formAction, isPending };
}

export function ChargerSheetTrigger({
  action,
  triggerLabel,
  title,
  defaultValues,
}: {
  readonly action: EntityAction;
  readonly triggerLabel: ReactNode;
  readonly title: string;
  readonly defaultValues: { label: string; vendor: string; model: string; powerKw: string; ocppVersion: string };
}) {
  const [open, setOpen] = useState(false);
  const { state, formAction, isPending } = useEntitySheet(action, 'Charger saved', () => setOpen(false));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center rounded-lg border border-[var(--border-strong)] px-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
      >
        {triggerLabel}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <form action={formAction} className="flex flex-col gap-4">
          {state.formError && (
            <p role="alert" className="text-sm font-medium text-danger-600">
              {state.formError}
            </p>
          )}
          <Field
            label="Label"
            name="label"
            required
            defaultValue={defaultValues.label}
            hint="e.g. Charger A, Bay 1"
            {...(state.fieldErrors.label ? { error: state.fieldErrors.label } : {})}
          />
          <Field label="Vendor" name="vendor" defaultValue={defaultValues.vendor} />
          <Field label="Model" name="model" defaultValue={defaultValues.model} />
          <Field
            label="Power (kW)"
            name="powerKw"
            type="number"
            step="0.1"
            required
            defaultValue={defaultValues.powerKw}
            {...(state.fieldErrors.powerKw ? { error: state.fieldErrors.powerKw } : {})}
          />
          <div>
            <label htmlFor="ocppVersion" className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
              OCPP version
            </label>
            <select
              id="ocppVersion"
              name="ocppVersion"
              defaultValue={defaultValues.ocppVersion}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3 py-2.5 text-base text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              {OCPP_VERSIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" loading={isPending} fullWidth>
            Save charger
          </Button>
        </form>
      </Sheet>
    </>
  );
}

export function ConnectorSheetTrigger({
  action,
  triggerLabel,
  title,
  defaultValues,
}: {
  readonly action: EntityAction;
  readonly triggerLabel: ReactNode;
  readonly title: string;
  readonly defaultValues: {
    connectorNumber: string;
    type: string;
    currentType: string;
    powerKw: string;
    status: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const { state, formAction, isPending } = useEntitySheet(action, 'Connector saved', () => setOpen(false));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center rounded-lg border border-[var(--border-strong)] px-2.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
      >
        {triggerLabel}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <form action={formAction} className="flex flex-col gap-4">
          {state.formError && (
            <p role="alert" className="text-sm font-medium text-danger-600">
              {state.formError}
            </p>
          )}
          <Field
            label="Connector number"
            name="connectorNumber"
            type="number"
            required
            defaultValue={defaultValues.connectorNumber}
            {...(state.fieldErrors.connectorNumber ? { error: state.fieldErrors.connectorNumber } : {})}
          />
          <div>
            <label htmlFor="type" className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
              Connector type
            </label>
            <select
              id="type"
              name="type"
              defaultValue={defaultValues.type}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3 py-2.5 text-base text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              {CONNECTOR_TYPES.map((t) => (
                <option key={t} value={t}>
                  {connectorTypeLabel(t)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="currentType" className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
              Current
            </label>
            <select
              id="currentType"
              name="currentType"
              defaultValue={defaultValues.currentType}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3 py-2.5 text-base text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              {CURRENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <Field
            label="Power (kW)"
            name="powerKw"
            type="number"
            step="0.1"
            required
            defaultValue={defaultValues.powerKw}
            {...(state.fieldErrors.powerKw ? { error: state.fieldErrors.powerKw } : {})}
          />
          <div>
            <label htmlFor="status" className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={defaultValues.status}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3 py-2.5 text-base text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              {OWNER_SETTABLE_CONNECTOR_STATUS.map((s) => (
                <option key={s} value={s}>
                  {presentStatus(CONNECTOR_STATUS, s).label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-[var(--text-muted)]">
              &quot;In use&quot; and &quot;Reserved&quot; are set automatically while charging.
            </p>
          </div>
          <Button type="submit" loading={isPending} fullWidth>
            Save connector
          </Button>
        </form>
      </Sheet>
    </>
  );
}
