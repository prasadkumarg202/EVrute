'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { Tables } from '@evrute/db';
import type { Database } from '@evrute/db/types';
import { CONNECTOR_STATUS, connectorTypeLabel, presentStatus } from '@evrute/core';
import { formatINR } from '@evrute/core';
import { Badge, Button, Card, CardBody, EmptyState } from '@/components/ui/index';
import { useToast } from '@/components/ui/toast';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { resolveTariff, requiredHoldAmount } from '@/lib/tariff';
import { cn } from '@/lib/utils/cn';

type StationRow = Tables<'stations'>;
type VehicleRow = Tables<'vehicles'>;
type ConnectorDetailRow = Database['public']['Views']['connector_details']['Row'];
type ReviewRow = {
  readonly id: string;
  readonly rating: number;
  readonly comment: string | null;
  readonly created_at: string;
  readonly owner_reply: string | null;
  readonly replied_at: string | null;
};

interface Props {
  readonly station: StationRow;
  readonly connectors: readonly ConnectorDetailRow[];
  readonly tariffs: readonly Tables<'tariffs'>[];
  readonly reviews: readonly ReviewRow[];
  readonly vehicles: readonly VehicleRow[];
  readonly isSignedIn: boolean;
  readonly spendableBalance: number;
}

function formatHours(station: StationRow): string {
  if (station.is_24x7) return 'Open 24 hours';
  if (station.open_time && station.close_time) {
    return `${station.open_time.slice(0, 5)} – ${station.close_time.slice(0, 5)}`;
  }
  return 'Hours not listed';
}

export function StationDetailClient({
  station,
  connectors,
  tariffs,
  reviews,
  vehicles,
  isSignedIn,
  spendableBalance,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(
    connectors.find((c) => c.status === 'available')?.connector_id ?? connectors[0]?.connector_id ?? null,
  );
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(
    vehicles.find((v) => v.is_primary)?.id ?? vehicles[0]?.id ?? '',
  );
  const [starting, setStarting] = useState(false);
  const [reserving, setReserving] = useState(false);

  const isOperable = station.is_operable;

  const selectedConnector = connectors.find((c) => c.connector_id === selectedConnectorId) ?? null;
  const selectedTariff = selectedConnector?.type
    ? resolveTariff(tariffs, selectedConnector.type)
    : null;
  const requiredHold = selectedTariff ? requiredHoldAmount(selectedTariff) : null;
  const insufficientBalance =
    isSignedIn && requiredHold != null ? spendableBalance < requiredHold : false;

  async function handleStart() {
    if (!selectedConnector?.connector_id) return;
    if (!isSignedIn) {
      router.push(`/login?next=${encodeURIComponent(`/station/${station.slug}`)}`);
      return;
    }
    setStarting(true);
    const { data, error } = await supabase.rpc('start_charging_session', {
      p_connector_id: selectedConnector.connector_id,
      p_idempotency_key: crypto.randomUUID(),
      ...(selectedVehicleId ? { p_vehicle_id: selectedVehicleId } : {}),
    });
    setStarting(false);

    if (error || !data) {
      toast.push({
        tone: 'danger',
        title: 'Could not start charging',
        description: error?.message ?? 'Please try again in a moment.',
      });
      return;
    }
    router.push(`/session/${data.id}`);
  }

  async function handleReserve() {
    if (!selectedConnector?.connector_id) return;
    if (!isSignedIn) {
      router.push(`/login?next=${encodeURIComponent(`/station/${station.slug}`)}`);
      return;
    }
    setReserving(true);
    const { data, error } = await supabase.rpc('create_reservation', {
      p_connector_id: selectedConnector.connector_id,
      p_minutes: 20,
      ...(selectedVehicleId ? { p_vehicle_id: selectedVehicleId } : {}),
    });
    setReserving(false);

    if (error || !data) {
      toast.push({
        tone: 'danger',
        title: 'Could not reserve this connector',
        description: error?.message ?? 'Please try again in a moment.',
      });
      return;
    }
    const expires = new Date(data.expires_at);
    toast.push({
      tone: 'success',
      title: 'Connector reserved',
      description: `Held for you until ${expires.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.`,
    });
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-4 pb-10 sm:px-5">
      <Link href="/" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
        <svg viewBox="0 0 24 24" fill="none" className="size-3.5" aria-hidden="true">
          <path d="M15 6 9 12l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to map
      </Link>

      <h1 className="font-display text-xl font-semibold text-[var(--text-primary)]">{station.name}</h1>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        {station.address_line1}
        {station.address_line2 ? `, ${station.address_line2}` : ''}, {station.city}, {station.state}
        {station.postal_code ? ` ${station.postal_code}` : ''}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-[var(--text-secondary)]">
        <span className="inline-flex items-center gap-1">
          <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 text-warning-500" aria-hidden="true">
            <path d="M10 1.5 12.6 7l6 .9-4.3 4.2 1 6-5.3-2.8L4.7 18l1-6L1.4 7.9l6-.9L10 1.5Z" />
          </svg>
          {station.rating_count > 0 ? `${station.rating_avg.toFixed(1)} (${station.rating_count})` : 'No ratings yet'}
        </span>
        <span>{formatHours(station)}</span>
      </div>

      {station.amenities.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {station.amenities.map((a) => (
            <span
              key={a}
              className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-xs text-[var(--text-secondary)]"
            >
              {a}
            </span>
          ))}
        </div>
      )}

      {!isOperable && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {station.network && (
            <Badge tone="neutral" dot={false}>
              {station.network}
            </Badge>
          )}
          <Badge
            tone="neutral"
            srHint="This station is listed for discovery only. It is operated by another network and cannot be started from EVRute."
          >
            Info only
          </Badge>
        </div>
      )}

      {isOperable ? (
        <>
          <section aria-labelledby="connectors-heading" className="mt-6">
            <h2 id="connectors-heading" className="font-display text-base font-semibold text-[var(--text-primary)]">
              Connectors
            </h2>

            {connectors.length === 0 ? (
              <EmptyState className="mt-2" title="No connectors listed" description="Check back soon." />
            ) : (
              <ul className="mt-3 space-y-2.5">
                {connectors.map((connector) => {
                  const status = presentStatus(CONNECTOR_STATUS, connector.status);
                  const tariff = connector.type ? resolveTariff(tariffs, connector.type) : null;
                  const selected = connector.connector_id === selectedConnectorId;
                  return (
                    <li key={connector.connector_id}>
                      <button
                        type="button"
                        onClick={() => setSelectedConnectorId(connector.connector_id)}
                        aria-pressed={selected}
                        className={cn(
                          'w-full rounded-[var(--radius-card)] border p-3.5 text-left transition-colors',
                          selected
                            ? 'border-[var(--accent)] bg-[var(--accent-subtle)]'
                            : 'border-[var(--border-subtle)] bg-[var(--surface-card)] hover:bg-[var(--surface-sunken)]',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-[var(--text-primary)]">
                            {connectorTypeLabel(connector.type)} · {connector.charger_label}
                            {connector.power_kw != null ? ` · ${Number(connector.power_kw).toFixed(0)} kW` : ''}
                          </span>
                          <Badge tone={status.tone} srHint={status.srHint}>
                            {status.label}
                          </Badge>
                        </div>
                        <p className="tabular mt-1.5 text-xs text-[var(--text-secondary)]">
                          {tariff
                            ? `${formatINR(tariff.price_per_kwh)}/kWh + ${formatINR(tariff.session_fee)} session fee`
                            : 'Pricing unavailable'}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {selectedConnector && (
            <Card className="mt-4">
              <CardBody className="space-y-3">
                {isSignedIn ? (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">Wallet balance</span>
                    <span className="tabular font-semibold text-[var(--text-primary)]">
                      {formatINR(spendableBalance)}
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-secondary)]">
                    <Link href={`/login?next=${encodeURIComponent(`/station/${station.slug}`)}`} className="font-medium text-[var(--accent)]">
                      Sign in
                    </Link>{' '}
                    to see your wallet balance and start charging.
                  </p>
                )}

                {vehicles.length > 0 && (
                  <div>
                    <label htmlFor="vehicle-select" className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
                      Vehicle
                    </label>
                    <select
                      id="vehicle-select"
                      value={selectedVehicleId}
                      onChange={(e) => setSelectedVehicleId(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3 py-2.5 text-sm text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    >
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.nickname ?? `${v.make} ${v.model}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {isSignedIn && insufficientBalance && requiredHold != null && (
                  <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-xs font-medium text-danger-700 dark:bg-danger-700/20 dark:text-danger-500">
                    You need at least {formatINR(requiredHold)} available to start here. Your spendable balance
                    is {formatINR(spendableBalance)}.{' '}
                    <Link href="/wallet" className="underline underline-offset-2">
                      Add money
                    </Link>
                  </p>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    fullWidth
                    loading={reserving}
                    disabled={selectedConnector.status !== 'available'}
                    onClick={() => void handleReserve()}
                  >
                    Reserve 20 min
                  </Button>
                  <Button
                    fullWidth
                    loading={starting}
                    disabled={selectedConnector.status !== 'available' || insufficientBalance}
                    onClick={() => void handleStart()}
                  >
                    Start charging
                  </Button>
                </div>
                {selectedConnector.status !== 'available' && (
                  <p className="text-xs text-[var(--text-muted)]">
                    This connector is {presentStatus(CONNECTOR_STATUS, selectedConnector.status).label.toLowerCase()} right now — pick another one above.
                  </p>
                )}
              </CardBody>
            </Card>
          )}

          <section aria-labelledby="reviews-heading" className="mt-8">
            <h2 id="reviews-heading" className="font-display text-base font-semibold text-[var(--text-primary)]">
              Reviews
            </h2>
            {reviews.length === 0 ? (
              <EmptyState className="mt-2" title="No reviews yet" description="Be the first to charge here and leave one." />
            ) : (
              <ul className="mt-3 space-y-3">
                {reviews.map((review) => (
                  <li key={review.id}>
                    <Card>
                      <CardBody>
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--text-primary)]">
                            <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 text-warning-500" aria-hidden="true">
                              <path d="M10 1.5 12.6 7l6 .9-4.3 4.2 1 6-5.3-2.8L4.7 18l1-6L1.4 7.9l6-.9L10 1.5Z" />
                            </svg>
                            {review.rating}/5
                          </span>
                          <time dateTime={review.created_at} className="text-xs text-[var(--text-muted)]">
                            {new Date(review.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </time>
                        </div>
                        {review.comment && <p className="mt-2 text-sm text-[var(--text-secondary)]">{review.comment}</p>}
                        {review.owner_reply && (
                          <div className="mt-3 rounded-lg bg-[var(--surface-sunken)] p-2.5">
                            <p className="text-xs font-semibold text-[var(--text-primary)]">Response from the station</p>
                            <p className="mt-1 text-xs text-[var(--text-secondary)]">{review.owner_reply}</p>
                          </div>
                        )}
                      </CardBody>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <>
          <Card className="mt-5">
            <CardBody className="space-y-3">
              <p className="text-sm text-[var(--text-secondary)]">
                This station is operated by{' '}
                <span className="font-semibold text-[var(--text-primary)]">{station.network ?? 'another network'}</span>,
                not EVRute. We list it so you can find it on the map, but starting a charge here needs{' '}
                {station.network ? `the ${station.network} app` : "that operator's own app"} — EVRute has no
                roaming agreement with them yet.
              </p>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium',
                  'bg-[var(--accent)] text-[var(--accent-text)] shadow-sm transition-colors duration-150 hover:bg-[var(--accent-hover)]',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
                )}
              >
                Open in Maps
                <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden="true">
                  <path
                    d="M7 17 17 7M17 7H9M17 7v8"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
            </CardBody>
          </Card>

          {(station.data_attribution || station.source_url) && (
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              {station.data_attribution}
              {station.data_attribution && station.source_url ? ' — ' : ''}
              {station.source_url && (
                <a
                  href={station.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-[var(--text-secondary)]"
                >
                  Source
                </a>
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
}
