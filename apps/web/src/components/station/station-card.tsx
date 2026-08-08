import Link from 'next/link';
import { formatINR } from '@evrute/core';
import type { Database } from '@evrute/db/types';
import { Badge, Card } from '@/components/ui/index';
import { formatDistance } from '@/lib/geo';

export type StationSearchRow = Database['public']['Functions']['search_stations']['Returns'][number];

function availabilityBadge(available: number, total: number) {
  if (total <= 0) return { tone: 'neutral' as const, label: 'No connectors listed' };
  if (available <= 0) return { tone: 'danger' as const, label: 'Fully occupied' };
  if (available === total) return { tone: 'success' as const, label: `${available}/${total} available` };
  return { tone: 'warning' as const, label: `${available}/${total} available` };
}

export function StationCard({ station }: { readonly station: StationSearchRow }) {
  const availability = availabilityBadge(station.available_connectors, station.total_connectors);

  return (
    <Card as="li" className="overflow-hidden">
      <Link
        href={`/station/${station.slug}`}
        className="block px-4 py-3.5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)] sm:px-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-display text-sm font-semibold text-[var(--text-primary)]">
              {station.name}
            </h3>
            <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
              {station.address_line1}, {station.city}
            </p>
          </div>
          {station.distance_m != null && (
            <span className="tabular shrink-0 text-xs font-medium text-[var(--text-muted)]">
              {formatDistance(station.distance_m)}
            </span>
          )}
        </div>

        {station.is_operable ? (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--text-secondary)]">
              <span className="tabular">
                {station.min_price_per_kwh != null
                  ? `${formatINR(station.min_price_per_kwh)}/kWh`
                  : 'Pricing unavailable'}
              </span>
              {station.max_power_kw != null && (
                <span className="tabular">Up to {Number(station.max_power_kw).toFixed(0)} kW</span>
              )}
              <span className="tabular inline-flex items-center gap-1">
                <svg viewBox="0 0 20 20" fill="currentColor" className="size-3.5 text-warning-500" aria-hidden="true">
                  <path d="M10 1.5 12.6 7l6 .9-4.3 4.2 1 6-5.3-2.8L4.7 18l1-6L1.4 7.9l6-.9L10 1.5Z" />
                </svg>
                {station.rating_count > 0 ? station.rating_avg.toFixed(1) : 'New'}
                {station.rating_count > 0 && <span className="text-[var(--text-muted)]">({station.rating_count})</span>}
              </span>
            </div>

            <div className="mt-2.5">
              <Badge tone={availability.tone}>{availability.label}</Badge>
            </div>
          </>
        ) : (
          <>
            <div className="mt-3 text-xs text-[var(--text-secondary)]">Availability not published</div>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {station.network && <Badge tone="neutral" dot={false}>{station.network}</Badge>}
              <Badge
                tone="neutral"
                srHint="This station is listed for discovery only. It is operated by another network and cannot be started from EVRute."
              >
                Info only
              </Badge>
            </div>
          </>
        )}
      </Link>
    </Card>
  );
}
