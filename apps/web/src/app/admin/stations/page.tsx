import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Badge, Card, CardBody } from '@/components/ui';
import { DataTable, DataTableSkeleton, type DataTableColumn } from '@/components/data-table';
import { StationStatusAction } from '@/components/admin/station-status-action';
import { presentStatus, STATION_STATUS } from '@evrute/core';
import { requireRole, createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Stations & owners' };

const PAGE_SIZE = 20;
const STATUSES = ['draft', 'under_review', 'active', 'maintenance', 'suspended'] as const;

interface StationRow {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  readonly state: string;
  readonly status: string;
  readonly ownerName: string;
}

export default async function AdminStationsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole('admin', 'employee');
  const sp = await searchParams;
  const page = Math.max(Number(sp['page'] ?? '1') || 1, 1);
  const q = typeof sp['q'] === 'string' ? sp['q'] : '';
  const status = typeof sp['status'] === 'string' ? sp['status'] : '';

  const resolvedParams: Record<string, string | undefined> = {
    page: sp['page'] as string | undefined,
    q: q || undefined,
    status: status || undefined,
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--text-primary)]">Stations &amp; owners</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Every station on the platform.</p>
      </div>

      <Card>
        <CardBody>
          <form className="grid grid-cols-1 gap-3 sm:grid-cols-3" method="get">
            <div className="sm:col-span-2">
              <label htmlFor="q" className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                Search name or city
              </label>
              <input
                id="q"
                name="q"
                defaultValue={q}
                className="h-10 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-card)] px-2.5 text-sm text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label htmlFor="status" className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                Status
              </label>
              <select
                id="status"
                name="status"
                defaultValue={status}
                className="h-10 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-card)] px-2.5 text-sm text-[var(--text-primary)]"
              >
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {presentStatus(STATION_STATUS, s).label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-3">
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

      <Suspense key={`${page}-${q}-${status}`} fallback={<DataTableSkeleton columnCount={5} />}>
        <StationsTable page={page} q={q} status={status} searchParams={resolvedParams} isAdmin={user.role === 'admin'} />
      </Suspense>
    </div>
  );
}

async function StationsTable({
  page,
  q,
  status,
  searchParams,
  isAdmin,
}: {
  readonly page: number;
  readonly q: string;
  readonly status: string;
  readonly searchParams: Record<string, string | undefined>;
  readonly isAdmin: boolean;
}) {
  const supabase = await createSupabaseServerClient();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('stations')
    .select('id, name, city, state, status, profiles!stations_owner_id_fkey(full_name)', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (q) query = query.or(`name.ilike.%${q}%,city.ilike.%${q}%`);
  if (status) query = query.eq('status', status as never);

  const { data, count, error } = await query.range(from, to);

  const columns: readonly DataTableColumn<StationRow>[] = [
    { key: 'name', header: 'Station', render: (r) => r.name },
    { key: 'owner', header: 'Owner', render: (r) => r.ownerName },
    { key: 'city', header: 'City', render: (r) => `${r.city}, ${r.state}` },
    {
      key: 'status',
      header: 'Status',
      render: (r) => {
        const s = presentStatus(STATION_STATUS, r.status);
        return (
          <Badge tone={s.tone} srHint={s.srHint}>
            {s.label}
          </Badge>
        );
      },
    },
    ...(isAdmin
      ? [
          {
            key: 'actions',
            header: 'Actions',
            render: (r: StationRow) => <StationStatusAction stationId={r.id} stationName={r.name} currentStatus={r.status} />,
          } satisfies DataTableColumn<StationRow>,
        ]
      : []),
  ];

  if (error || !data) {
    return (
      <DataTable<StationRow>
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        caption="Stations"
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={0}
        basePath="/admin/stations"
        searchParams={searchParams}
        emptyTitle="Couldn't load stations"
        errorMessage={error?.message ?? 'Unknown error'}
      />
    );
  }

  const rows: StationRow[] = data.map((s) => ({
    id: s.id,
    name: s.name,
    city: s.city,
    state: s.state,
    status: s.status,
    ownerName: s.profiles?.full_name || 'Unknown owner',
  }));

  return (
    <DataTable<StationRow>
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      caption="Stations"
      page={page}
      pageSize={PAGE_SIZE}
      totalCount={count ?? rows.length}
      basePath="/admin/stations"
      searchParams={searchParams}
      emptyTitle="No stations found"
      emptyDescription="Try widening your search."
    />
  );
}
