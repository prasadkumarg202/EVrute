import Link from 'next/link';
import type { LatLng } from '@/lib/geo';
import { formatDistance, projectRelative } from '@/lib/geo';
import type { StationSearchRow } from '@/components/station/station-card';

/**
 * A lightweight, dependency-free scatter of nearby stations relative to the
 * search origin. Not a tile map — the deployment has no map-tile API key —
 * but genuinely useful: relative bearing and distance at a glance, and each
 * dot is a real link into the station.
 */
export function StationMiniMap({
  center,
  stations,
}: {
  readonly center: LatLng;
  readonly stations: readonly StationSearchRow[];
}) {
  const points = stations
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => ({ station: s, ...projectRelative(center, { lat: Number(s.lat), lng: Number(s.lng) }) }));

  const maxDist = Math.max(500, ...points.map((p) => Math.hypot(p.dx, p.dy)));
  const scale = 82 / maxDist;
  const ringRadii = [maxDist / 3, (maxDist / 3) * 2, maxDist];

  return (
    <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
      <svg
        viewBox="0 0 200 200"
        role="img"
        aria-label={`Map showing ${points.length} nearby station${points.length === 1 ? '' : 's'} relative to your search location`}
        className="block w-full"
      >
        {ringRadii.map((r) => (
          <circle
            key={r}
            cx={100}
            cy={100}
            r={r * scale}
            fill="none"
            stroke="var(--border-subtle)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ))}

        {points.map((p) => {
          const x = Math.min(194, Math.max(6, 100 + p.dx * scale));
          const y = Math.min(194, Math.max(6, 100 + p.dy * scale));
          const available = p.station.available_connectors > 0;
          return (
            <g key={p.station.id}>
              <circle
                cx={x}
                cy={y}
                r={5}
                className={available ? 'fill-success-500' : 'fill-danger-500'}
                stroke="var(--surface-card)"
                strokeWidth={1.5}
              />
            </g>
          );
        })}

        {/* User / search origin marker, drawn last so it stays on top. */}
        <circle cx={100} cy={100} r={5} fill="var(--accent)" stroke="var(--surface-card)" strokeWidth={2} />
        <circle cx={100} cy={100} r={9} fill="none" stroke="var(--accent)" strokeWidth={1.5} opacity={0.4} />
      </svg>

      {/* Invisible tap targets, positioned in the same coordinate space via percentages. */}
      <div className="pointer-events-none absolute inset-0">
        {points.map((p) => {
          const xPct = Math.min(97, Math.max(3, 50 + ((p.dx * scale) / 200) * 100));
          const yPct = Math.min(97, Math.max(3, 50 + ((p.dy * scale) / 200) * 100));
          return (
            <Link
              key={p.station.id}
              href={`/station/${p.station.slug}`}
              title={`${p.station.name} — ${formatDistance(p.station.distance_m)}`}
              aria-label={`${p.station.name}, ${formatDistance(p.station.distance_m)} away`}
              className="pointer-events-auto absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              style={{ left: `${xPct}%`, top: `${yPct}%` }}
            />
          );
        })}
      </div>

      <div className="absolute bottom-2 left-2 flex items-center gap-3 rounded-full bg-[var(--surface-card)]/90 px-2.5 py-1 text-[10px] font-medium text-[var(--text-secondary)] shadow-[var(--shadow-card)]">
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-success-500" /> Available
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-danger-500" /> Full
        </span>
      </div>
    </div>
  );
}
