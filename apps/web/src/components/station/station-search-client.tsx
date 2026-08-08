'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Enums } from '@evrute/db';
import { connectorTypeLabel } from '@evrute/core';
import { EmptyState, ErrorState, Field, LoadingRegion, Skeleton } from '@/components/ui/index';
import { StationCard, type StationSearchRow } from '@/components/station/station-card';
import { StationMiniMap } from '@/components/station/station-mini-map';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { LatLng } from '@/lib/geo';
import { cn } from '@/lib/utils/cn';

type ConnectorType = Enums<'connector_type'>;

const CONNECTOR_TYPE_OPTIONS: readonly ConnectorType[] = ['CCS2', 'TYPE2', 'GBT', 'CHADEMO'];
const SEARCH_RADIUS_M = 25_000;
const DEBOUNCE_MS = 350;

interface Props {
  readonly initialStations: readonly StationSearchRow[];
  readonly initialCenter: LatLng;
}

type LocateState =
  | 'idle'
  | 'locating'
  | 'located'
  | 'denied'      // user (or browser policy) refused
  | 'unavailable' // device could not get a fix
  | 'timeout'     // took too long
  | 'insecure'    // not a secure context
  | 'unsupported';

const LOCATE_MESSAGES: Record<Exclude<LocateState, 'idle' | 'locating' | 'located'>, string> = {
  denied:
    'Location is blocked for this site. Click the padlock in the address bar → Location → Allow, then try again.',
  unavailable:
    'Your device could not determine a position. On a desktop without GPS this is common — search by area name instead.',
  timeout: 'Locating took too long. Try again, or search by area name.',
  insecure:
    'Location needs a secure connection (https:// or localhost). Open the site over HTTPS to use it.',
  unsupported: 'This browser does not support location. Search by area name instead.',
};

export function StationSearchClient({ initialStations, initialCenter }: Props) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [center, setCenter] = useState<LatLng>(initialCenter);
  const [locateState, setLocateState] = useState<LocateState>('idle');
  const [connectorTypes, setConnectorTypes] = useState<readonly ConnectorType[]>([]);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [onlyOperable, setOnlyOperable] = useState(false);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [stations, setStations] = useState<readonly StationSearchRow[]>(initialStations);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFirstRun = useRef(true);

  // Debounce the free-text query so every keystroke doesn't trigger a fetch.
  useEffect(() => {
    const handle = setTimeout(() => setQuery(queryInput.trim()), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [queryInput]);

  const runSearch = useCallback(
    async (origin: LatLng) => {
      setLoading(true);
      setError(null);
      const { data, error: rpcError } = await supabase.rpc('search_stations', {
        p_lat: origin.lat,
        p_lng: origin.lng,
        p_radius_m: SEARCH_RADIUS_M,
        p_only_available: onlyAvailable,
        p_only_operable: onlyOperable,
        p_limit: 60,
        p_offset: 0,
        ...(connectorTypes.length > 0 ? { p_connector_types: [...connectorTypes] } : {}),
        ...(query.length > 0 ? { p_query: query } : {}),
      });

      if (rpcError) {
        setError(rpcError.message);
        setLoading(false);
        return;
      }
      setStations(data ?? []);
      setLoading(false);
    },
    [supabase, connectorTypes, onlyAvailable, onlyOperable, query],
  );

  // Re-run whenever the origin or filters change. Skip the very first render
  // since the server already fetched the default-centre, unfiltered result.
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    void runSearch(center);
  }, [center, runSearch]);

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setLocateState('unsupported');
      return;
    }
    // Geolocation is only available in a secure context. Reporting this
    // explicitly beats a generic "denied", which is what the browser
    // otherwise surfaces.
    if (!window.isSecureContext) {
      setLocateState('insecure');
      return;
    }

    setLocateState('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCenter({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocateState('located');
      },
      (error) => {
        // The error carries a code distinguishing three very different
        // problems. Collapsing them all to "denied" (as this did) sends the
        // user to reset a permission that was never the issue.
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocateState('denied');
            break;
          case error.POSITION_UNAVAILABLE:
            setLocateState('unavailable');
            break;
          case error.TIMEOUT:
            setLocateState('timeout');
            break;
          default:
            setLocateState('unavailable');
        }
      },
      // 8s is not enough for a desktop resolving position over Wi-Fi/IP.
      { enableHighAccuracy: false, timeout: 20_000, maximumAge: 300_000 },
    );
  }, []);

  // Only auto-locate if permission was ALREADY granted.
  //
  // Calling getCurrentPosition on mount triggers a permission prompt with no
  // user gesture behind it. Chrome and Edge increasingly auto-block those,
  // and a block is recorded as a persistent denial for the origin — after
  // which the manual button silently fails forever, which is exactly the
  // failure that looked like "use my location is not working".
  useEffect(() => {
    if (!('permissions' in navigator)) return;
    let cancelled = false;
    void navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((status) => {
        if (!cancelled && status.state === 'granted') locate();
      })
      .catch(() => {
        /* Permissions API unsupported: wait for the button. */
      });
    return () => {
      cancelled = true;
    };
  }, [locate]);

  function toggleConnectorType(type: ConnectorType) {
    setConnectorTypes((current) =>
      current.includes(type) ? current.filter((t) => t !== type) : [...current, type],
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-4 pb-8 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl font-semibold text-[var(--text-primary)]">Find a charger</h1>
        <button
          type="button"
          onClick={locate}
          disabled={locateState === 'locating'}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-60"
        >
          <svg viewBox="0 0 24 24" fill="none" className="size-3.5" aria-hidden="true">
            <path
              d="M12 2v3M12 19v3M2 12h3M19 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          {locateState === 'locating' ? 'Locating…' : 'Use my location'}
        </button>
      </div>

      {locateState !== 'idle' && locateState !== 'locating' && locateState !== 'located' && (
        <p role="status" className="mt-1.5 text-xs text-[var(--text-muted)]">
          {LOCATE_MESSAGES[locateState]}
        </p>
      )}

      <div className="mt-4">
        <Field
          label="Search"
          type="search"
          placeholder="Search by station or area name"
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter by connector type">
        {CONNECTOR_TYPE_OPTIONS.map((type) => {
          const active = connectorTypes.includes(type);
          return (
            <button
              key={type}
              type="button"
              aria-pressed={active}
              onClick={() => toggleConnectorType(type)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
                  : 'border-[var(--border-strong)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]',
              )}
            >
              {connectorTypeLabel(type)}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={onlyAvailable}
          onClick={() => setOnlyAvailable((v) => !v)}
          className={cn(
            'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
            onlyAvailable
              ? 'border-success-500 bg-success-50 text-success-700 dark:bg-success-700/20 dark:text-success-500'
              : 'border-[var(--border-strong)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]',
          )}
        >
          Available only
        </button>
        <button
          type="button"
          aria-pressed={onlyOperable}
          onClick={() => setOnlyOperable((v) => !v)}
          title="Show only stations EVRute can start a charge on"
          className={cn(
            'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
            onlyOperable
              ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
              : 'border-[var(--border-strong)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]',
          )}
        >
          EVRute chargers only
        </button>
      </div>

      <div className="mt-4">
        <StationMiniMap center={center} stations={stations} />
      </div>

      <div className="mt-5">
        {loading ? (
          <LoadingRegion label="Searching for stations">
            <div className="space-y-3">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          </LoadingRegion>
        ) : error ? (
          <ErrorState description={error} onRetry={() => void runSearch(center)} />
        ) : stations.length === 0 ? (
          <EmptyState
            icon={
              <svg viewBox="0 0 24 24" fill="none" className="size-7">
                <path
                  d="m21 21-4.3-4.3M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
            title="No chargers found nearby"
            description="Try widening your filters, clearing the search text, or turning off 'available only' / 'EVRute chargers only'."
          />
        ) : (
          <ul className="space-y-3" aria-label="Nearby charging stations">
            {stations.map((station) => (
              <StationCard key={station.id} station={station} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
