'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import type { Tables } from '@evrute/db';
import { connectorTypeLabel, estimateChargeMinutes, formatDuration } from '@evrute/core';
import { Badge, Button, Card, CardBody, EmptyState, Field, Sheet } from '@/components/ui/index';
import { useToast } from '@/components/ui/toast';
import {
  addVehicle,
  deleteVehicle,
  setPrimaryVehicle,
  updateVehicle,
  type VehicleFormState,
} from '@/app/(customer)/vehicles/actions';

type VehicleRow = Tables<'vehicles'>;

const CONNECTOR_TYPES = ['CCS2', 'TYPE2', 'GBT', 'CHADEMO', 'AC_3PIN'] as const;
const INITIAL_STATE: VehicleFormState = { ok: false };
// Typical mid-power public DC charger, used only to give a rough "how long
// to charge" hint when a vehicle has no max_charge_rate_kw of its own.
const ASSUMED_CHARGER_KW = 50;

export function VehiclesClient({ vehicles }: { readonly vehicles: readonly VehicleRow[] }) {
  const [sheetVehicle, setSheetVehicle] = useState<VehicleRow | 'new' | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function handleDelete(vehicle: VehicleRow) {
    if (!window.confirm(`Remove ${vehicle.nickname ?? `${vehicle.make} ${vehicle.model}`}?`)) return;
    startTransition(async () => {
      const result = await deleteVehicle(vehicle.id);
      if (!result.ok) {
        toast.push({ tone: 'danger', title: 'Could not remove vehicle', ...(result.error ? { description: result.error } : {}) });
      } else {
        toast.push({ tone: 'success', title: 'Vehicle removed' });
      }
    });
  }

  function handleSetPrimary(vehicle: VehicleRow) {
    startTransition(async () => {
      const result = await setPrimaryVehicle(vehicle.id);
      if (!result.ok) {
        toast.push({
          tone: 'danger',
          title: 'Could not set primary vehicle',
          ...(result.error ? { description: result.error } : {}),
        });
      }
    });
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-4 pb-10 sm:px-5">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-[var(--text-primary)]">Your vehicles</h1>
        <Button size="sm" onClick={() => setSheetVehicle('new')}>
          Add vehicle
        </Button>
      </div>

      {vehicles.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="No vehicles yet"
          description="Add a vehicle to get charge-time estimates and a faster checkout."
          action={<Button onClick={() => setSheetVehicle('new')}>Add your first vehicle</Button>}
        />
      ) : (
        <ul className="mt-5 space-y-3">
          {vehicles.map((vehicle) => {
            const powerKw = vehicle.max_charge_rate_kw ?? ASSUMED_CHARGER_KW;
            const minutes = estimateChargeMinutes({
              batteryCapacityKwh: vehicle.battery_capacity_kwh,
              fromSocPct: 20,
              toSocPct: 80,
              powerKw,
            });
            return (
              <li key={vehicle.id}>
                <Card>
                  <CardBody>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-[var(--text-primary)]">
                            {vehicle.nickname ?? `${vehicle.make} ${vehicle.model}`}
                          </p>
                          {vehicle.is_primary && <Badge tone="info">Primary</Badge>}
                        </div>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {vehicle.make} {vehicle.model} · {connectorTypeLabel(vehicle.connector_type)}
                          {vehicle.plate_number ? ` · ${vehicle.plate_number}` : ''}
                        </p>
                      </div>
                    </div>

                    <p className="tabular mt-2.5 text-xs text-[var(--text-secondary)]">
                      {vehicle.battery_capacity_kwh} kWh battery · ~{formatDuration(minutes * 60)} for a 20→80%
                      charge at up to {powerKw} kW
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {!vehicle.is_primary && (
                        <Button variant="secondary" size="sm" disabled={pending} onClick={() => handleSetPrimary(vehicle)}>
                          Set primary
                        </Button>
                      )}
                      <Button variant="secondary" size="sm" onClick={() => setSheetVehicle(vehicle)}>
                        Edit
                      </Button>
                      <Button variant="danger" size="sm" disabled={pending} onClick={() => handleDelete(vehicle)}>
                        Remove
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <VehicleFormSheet
        open={sheetVehicle !== null}
        vehicle={sheetVehicle === 'new' ? null : sheetVehicle}
        onClose={() => setSheetVehicle(null)}
      />
    </div>
  );
}

function VehicleFormSheet({
  open,
  vehicle,
  onClose,
}: {
  readonly open: boolean;
  readonly vehicle: VehicleRow | null;
  readonly onClose: () => void;
}) {
  const isEdit = vehicle !== null;
  const action = isEdit ? updateVehicle.bind(null, vehicle.id) : addVehicle;
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  const toast = useToast();
  const handledSuccess = useRef(state);

  useEffect(() => {
    if (state.ok && handledSuccess.current !== state) {
      handledSuccess.current = state;
      toast.push({ tone: 'success', title: isEdit ? 'Vehicle updated' : 'Vehicle added' });
      onClose();
    }
  }, [state, isEdit, onClose, toast]);

  return (
    <Sheet open={open} onClose={onClose} title={isEdit ? 'Edit vehicle' : 'Add vehicle'}>
      <form action={formAction} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Make" name="make" defaultValue={vehicle?.make} required maxLength={60} />
          <Field label="Model" name="model" defaultValue={vehicle?.model} required maxLength={60} />
        </div>
        <Field label="Nickname" name="nickname" defaultValue={vehicle?.nickname ?? ''} maxLength={40} hint="Optional" />
        <Field
          label="Plate number"
          name="plateNumber"
          defaultValue={vehicle?.plate_number ?? ''}
          maxLength={15}
          hint="Optional"
        />

        <div>
          <label htmlFor="connectorType" className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
            Connector type
          </label>
          <select
            id="connectorType"
            name="connectorType"
            defaultValue={vehicle?.connector_type ?? 'CCS2'}
            className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3 py-2.5 text-base text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {CONNECTOR_TYPES.map((type) => (
              <option key={type} value={type}>
                {connectorTypeLabel(type)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Battery capacity"
            name="batteryCapacityKwh"
            type="number"
            inputMode="decimal"
            min={1}
            max={500}
            step="0.1"
            defaultValue={vehicle?.battery_capacity_kwh}
            required
            prefix="kWh"
          />
          <Field
            label="Max charge rate"
            name="maxChargeRateKw"
            type="number"
            inputMode="decimal"
            min={1}
            max={500}
            step="0.1"
            defaultValue={vehicle?.max_charge_rate_kw ?? ''}
            hint="Optional"
            prefix="kW"
          />
        </div>

        {state.error && (
          <p role="alert" className="text-sm font-medium text-danger-600">
            {state.error}
          </p>
        )}

        <Button type="submit" fullWidth loading={pending}>
          {isEdit ? 'Save changes' : 'Add vehicle'}
        </Button>
      </form>
    </Sheet>
  );
}
