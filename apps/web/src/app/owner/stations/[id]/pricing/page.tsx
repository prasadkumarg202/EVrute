import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Card, CardBody, EmptyState } from '@/components/ui';
import { TariffSheetTrigger } from '@/components/forms/tariff-sheet-form';
import { createTariffAction } from './actions';
import { requireRole, createSupabaseServerClient } from '@/lib/supabase/server';
import { connectorTypeLabel, formatINR } from '@evrute/core';
import { formatDateTime } from '@/lib/utils/format';
import type { EntityActionState } from '@/lib/entity-action-state';

export const metadata: Metadata = { title: 'Pricing' };

export default async function StationPricingPage({ params }: { readonly params: Promise<{ id: string }> }) {
  await requireRole('owner', 'admin');
  const { id: stationId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: station } = await supabase.from('stations').select('id, name').eq('id', stationId).single();
  if (!station) notFound();

  const { data: tariffs, error } = await supabase
    .from('tariffs')
    .select('*')
    .eq('station_id', stationId)
    .order('effective_from', { ascending: false });

  const boundAction = createTariffAction.bind(null, stationId) as (
    state: EntityActionState,
    formData: FormData,
  ) => Promise<EntityActionState>;

  const now = Date.now();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[var(--text-primary)]">
            Pricing — {station.name}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Prices are versioned — changing a price never edits history, it adds a new one.{' '}
            <Link href={`/owner/stations/${stationId}`} className="text-[var(--accent)] hover:underline">
              Back to station
            </Link>
          </p>
        </div>
        <TariffSheetTrigger action={boundAction} />
      </div>

      {error || !tariffs ? (
        <Card>
          <CardBody>
            <EmptyState title="Couldn't load pricing" {...(error?.message ? { description: error.message } : {})} />
          </CardBody>
        </Card>
      ) : tariffs.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState title="No pricing set yet" description="Add pricing so drivers can start sessions here." />
          </CardBody>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Pricing history for {station.name}</caption>
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Applies to</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Price/kWh</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Session fee</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Idle fee/min</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Tax</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Effective window</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Status</th>
                </tr>
              </thead>
              <tbody>
                {tariffs.map((tariff) => {
                  const from = new Date(tariff.effective_from).getTime();
                  const to = tariff.effective_to ? new Date(tariff.effective_to).getTime() : null;
                  const isCurrent = from <= now && (to === null || to > now);
                  return (
                    <tr key={tariff.id} className="border-b border-[var(--border-subtle)] last:border-0">
                      <td className="px-4 py-3 text-[var(--text-primary)]">
                        {tariff.connector_type ? connectorTypeLabel(tariff.connector_type) : 'All connector types'}
                      </td>
                      <td className="px-4 py-3 tabular text-[var(--text-primary)]">{formatINR(tariff.price_per_kwh)}</td>
                      <td className="px-4 py-3 tabular text-[var(--text-primary)]">{formatINR(tariff.session_fee)}</td>
                      <td className="px-4 py-3 tabular text-[var(--text-primary)]">{formatINR(tariff.idle_fee_per_min)}</td>
                      <td className="px-4 py-3 tabular text-[var(--text-primary)]">{tariff.tax_pct}%</td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">
                        {formatDateTime(tariff.effective_from)} – {tariff.effective_to ? formatDateTime(tariff.effective_to) : 'ongoing'}
                      </td>
                      <td className="px-4 py-3">
                        {isCurrent ? <Badge tone="success">Current</Badge> : <Badge tone="neutral">Past</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
