import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Card, CardBody, CardHeader, CardTitle, EmptyState } from '@/components/ui';
import { ChargerSheetTrigger, ConnectorSheetTrigger } from '@/components/forms/charger-connector-forms';
import { saveChargerAction, saveConnectorAction } from './actions';
import { requireRole, createSupabaseServerClient } from '@/lib/supabase/server';
import { connectorTypeLabel, presentStatus, CHARGER_STATUS, CONNECTOR_STATUS } from '@evrute/core';
import type { EntityActionState } from '@/lib/entity-action-state';

export const metadata: Metadata = { title: 'Chargers' };

type BoundAction = (state: EntityActionState, formData: FormData) => Promise<EntityActionState>;

export default async function StationChargersPage({ params }: { readonly params: Promise<{ id: string }> }) {
  await requireRole('owner', 'admin');
  const { id: stationId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: station } = await supabase.from('stations').select('id, name').eq('id', stationId).single();
  if (!station) notFound();

  const { data: chargers, error } = await supabase
    .from('chargers')
    .select('*, connectors(*)')
    .eq('station_id', stationId)
    .order('label');

  const addChargerAction = saveChargerAction.bind(null, stationId, null) as BoundAction;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[var(--text-primary)]">
            Chargers — {station.name}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Manage chargers and their connectors.{' '}
            <Link href={`/owner/stations/${stationId}`} className="text-[var(--accent)] hover:underline">
              Back to station
            </Link>
          </p>
        </div>
        <ChargerSheetTrigger
          action={addChargerAction}
          title="Add charger"
          triggerLabel="Add charger"
          defaultValues={{ label: '', vendor: '', model: '', powerKw: '', ocppVersion: '1.6J' }}
        />
      </div>

      {error || !chargers ? (
        <Card>
          <CardBody>
            <EmptyState title="Couldn't load chargers" {...(error?.message ? { description: error.message } : {})} />
          </CardBody>
        </Card>
      ) : chargers.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState title="No chargers yet" description="Add your first charger to start accepting sessions." />
          </CardBody>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {chargers.map((charger) => {
            const chargerStatus = presentStatus(CHARGER_STATUS, charger.status);
            const editChargerAction = saveChargerAction.bind(null, stationId, charger.id) as BoundAction;
            const addConnectorAction = saveConnectorAction.bind(null, stationId, charger.id, null) as BoundAction;

            return (
              <Card key={charger.id}>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <CardTitle>{charger.label}</CardTitle>
                    <Badge tone={chargerStatus.tone} srHint={chargerStatus.srHint}>
                      {chargerStatus.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--text-muted)]">
                      {charger.vendor ?? 'Unknown vendor'} · {charger.power_kw} kW · OCPP {charger.ocpp_version}
                    </span>
                    <ChargerSheetTrigger
                      action={editChargerAction}
                      title="Edit charger"
                      triggerLabel="Edit"
                      defaultValues={{
                        label: charger.label,
                        vendor: charger.vendor ?? '',
                        model: charger.model ?? '',
                        powerKw: String(charger.power_kw),
                        ocppVersion: charger.ocpp_version,
                      }}
                    />
                  </div>
                </CardHeader>
                <CardBody>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-medium text-[var(--text-primary)]">Connectors</h3>
                    <ConnectorSheetTrigger
                      action={addConnectorAction}
                      title="Add connector"
                      triggerLabel="Add connector"
                      defaultValues={{
                        connectorNumber: String((charger.connectors?.length ?? 0) + 1),
                        type: 'CCS2',
                        currentType: 'DC',
                        powerKw: String(charger.power_kw),
                        status: 'available',
                      }}
                    />
                  </div>

                  {!charger.connectors || charger.connectors.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)]">No connectors added yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-sm">
                        <caption className="sr-only">Connectors for {charger.label}</caption>
                        <thead>
                          <tr className="border-b border-[var(--border-subtle)]">
                            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">#</th>
                            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Type</th>
                            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Current</th>
                            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Power</th>
                            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Status</th>
                            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                              <span className="sr-only">Actions</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {charger.connectors.map((connector) => {
                            const connectorStatus = presentStatus(CONNECTOR_STATUS, connector.status);
                            const editConnectorAction = saveConnectorAction.bind(
                              null,
                              stationId,
                              charger.id,
                              connector.id,
                            ) as BoundAction;
                            return (
                              <tr key={connector.id} className="border-b border-[var(--border-subtle)] last:border-0">
                                <td className="px-3 py-2 tabular text-[var(--text-primary)]">{connector.connector_number}</td>
                                <td className="px-3 py-2 text-[var(--text-primary)]">{connectorTypeLabel(connector.type)}</td>
                                <td className="px-3 py-2 text-[var(--text-secondary)]">{connector.current_type}</td>
                                <td className="px-3 py-2 tabular text-[var(--text-primary)]">{connector.power_kw} kW</td>
                                <td className="px-3 py-2">
                                  <Badge tone={connectorStatus.tone} srHint={connectorStatus.srHint}>
                                    {connectorStatus.label}
                                  </Badge>
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <ConnectorSheetTrigger
                                    action={editConnectorAction}
                                    title="Edit connector"
                                    triggerLabel="Edit"
                                    defaultValues={{
                                      connectorNumber: String(connector.connector_number),
                                      type: connector.type,
                                      currentType: connector.current_type,
                                      powerKw: String(connector.power_kw),
                                      status: connector.status === 'occupied' || connector.status === 'reserved'
                                        ? 'available'
                                        : connector.status,
                                    }}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
