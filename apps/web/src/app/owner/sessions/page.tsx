import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Badge, Card, CardBody } from '@/components/ui';
import { DataTable, DataTableSkeleton, type DataTableColumn } from '@/components/data-table';
import { presentStatus, SESSION_STATUS, formatINR, formatKwh } from '@evrute/core';
import { requireRole, createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Sessions' };

const PAGE_SIZE = 20;
const SESSION_STATUSES = ['pending', 'active', 'completed', 'failed', 'cancelled'] as const;

interface SessionRow {
  readonly id: string;
  readonly status: string;
  readonly energyKwh: number;
  readonly totalCost: number;
  readonly startedAt: string | null;
  readonly stoppedAt: string | null;
  readonly stationName: string;
  readonly connectorType: string;
}

type SessionStatusFilter = (typeof SESSION_STATUSES)[number];

interface SessionFilters {
  readonly status?: SessionStatusFilter;
  readonly stationId?: string;
  readonly from?: string;
  readonly to?: string;
}

function isSessionStatus(value: string): value is SessionStatusFilter {
  return (SESSION_STATUSES as readonly string[]).includes(value);
}

export default async function OwnerSessionsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole('owner', 'admin');
  const sp = await searchParams;
  const page = Math.max(Number(sp['page'] ?? '1') || 1, 1);

  const statusParam = typeof sp['status'] === 'string' ? sp['status'] : '';

  const filters: SessionFilters = {
    ...(statusParam && isSessionStatus(statusParam) ? { status: statusParam } : {}),
    ...(typeof sp['station'] === 'string' && sp['station'] ? { stationId: sp['station'] } : {}),
    ...(typeof sp['from'] === 'string' && sp['from'] ? { from: sp['from'] } : {}),
    ...(typeof sp['to'] === 'string' && sp['to'] ? { to: sp['to'] } : {}),
  };

  const resolvedParams: Record<string, string | undefined> = {
    page: sp['page'] as string | undefined,
    status: filters.status,
    station: filters.stationId,
    from: filters.from,
    to: filters.to,
  };

  const supabase = await createSupabaseServerClient();
  const { data: stations } = await supabase
    .from('stations')
    .select('id, name')
    .eq('owner_id', user.id)
    .order('name');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--text-primary)]">Sessions</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Charging sessions across all of your stations.</p>
      </div>

      <Card>
        <CardBody>
          <form className="grid grid-cols-1 gap-3 sm:grid-cols-4" method="get">
            <div>
              <label htmlFor="status" className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                Status
              </label>
              <select
                id="status"
                name="status"
                defaultValue={filters.status ?? ''}
                className="h-10 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-card)] px-2.5 text-sm text-[var(--text-primary)]"
              >
                <option value="">All statuses</option>
                {SESSION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {presentStatus(SESSION_STATUS, s).label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="station" className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                Station
              </label>
              <select
                id="station"
                name="station"
                defaultValue={filters.stationId ?? ''}
                className="h-10 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-card)] px-2.5 text-sm text-[var(--text-primary)]"
              >
                <option value="">All stations</option>
                {(stations ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="from" className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                From
              </label>
              <input
                id="from"
                type="date"
                name="from"
                defaultValue={filters.from ?? ''}
                className="h-10 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-card)] px-2.5 text-sm text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label htmlFor="to" className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                To
              </label>
              <input
                id="to"
                type="date"
                name="to"
                defaultValue={filters.to ?? ''}
                className="h-10 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-card)] px-2.5 text-sm text-[var(--text-primary)]"
              />
            </div>
            <div className="sm:col-span-4">
              <button
                type="submit"
                className="inline-flex h-10 items-center rounded-lg bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-text)] hover:bg-[var(--accent-hover)]"
              >
                Apply filters
              </button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Suspense key={`${page}-${JSON.stringify(filters)}`} fallback={<DataTableSkeleton columnCount={6} />}>
        <SessionsTable page={page} filters={filters} searchParams={resolvedParams} />
      </Suspense>
    </div>
  );
}

async function SessionsTable({
  page,
  filters,
  searchParams,
}: {
  readonly page: number;
  readonly filters: SessionFilters;
  readonly searchParams: Record<string, string | undefined>;
}) {
  const supabase = await createSupabaseServerClient();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('sessions')
    .select('id, status, energy_kwh, total_cost, started_at, stopped_at, stations(name), connectors(type)', {
      count: 'exact',
    })
    .order('created_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.stationId) query = query.eq('station_id', filters.stationId);
  if (filters.from) query = query.gte('created_at', new Date(filters.from).toISOString());
  if (filters.to) {
    const toDate = new Date(filters.to);
    toDate.setDate(toDate.getDate() + 1);
    query = query.lt('created_at', toDate.toISOString());
  }

  const { data, count, error } = await query.range(from, to);

  if (error || !data) {
    return (
      <DataTable<SessionRow>
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        caption="Sessions"
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={0}
        basePath="/owner/sessions"
        searchParams={searchParams}
        emptyTitle="Couldn't load sessions"
        errorMessage={error?.message ?? 'Unknown error'}
      />
    );
  }

  const rows: SessionRow[] = data.map((s) => ({
    id: s.id,
    status: s.status,
    energyKwh: s.energy_kwh,
    totalCost: s.total_cost,
    startedAt: s.started_at,
    stoppedAt: s.stopped_at,
    stationName: s.stations?.name ?? '—',
    connectorType: s.connectors?.type ?? '—',
  }));

  return (
    <DataTable<SessionRow>
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      caption="Sessions"
      page={page}
      pageSize={PAGE_SIZE}
      totalCount={count ?? rows.length}
      basePath="/owner/sessions"
      searchParams={searchParams}
      emptyTitle="No sessions found"
      emptyDescription="Try widening your filters."
    />
  );
}

const columns: readonly DataTableColumn<SessionRow>[] = [
  { key: 'station', header: 'Station', render: (r) => r.stationName },
  { key: 'connector', header: 'Connector', render: (r) => r.connectorType },
  {
    key: 'status',
    header: 'Status',
    render: (r) => {
      const status = presentStatus(SESSION_STATUS, r.status);
      return (
        <Badge tone={status.tone} srHint={status.srHint}>
          {status.label}
        </Badge>
      );
    },
  },
  { key: 'energy', header: 'Energy', render: (r) => formatKwh(r.energyKwh) },
  { key: 'amount', header: 'Amount', render: (r) => formatINR(r.totalCost) },
  { key: 'started', header: 'Started', render: (r) => formatDateTime(r.startedAt) },
];
