import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Badge, Button } from '@/components/ui';
import { DataTable, DataTableSkeleton, type DataTableColumn } from '@/components/data-table';
import { FlashToast } from '@/components/flash-toast';
import { presentStatus, STATION_STATUS, formatINR } from '@evrute/core';
import { requireRole, createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Stations' };

const PAGE_SIZE = 15;

interface StationRow {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  readonly state: string;
  readonly status: string;
  readonly chargerCount: number;
  readonly todayRevenue: number;
}

export default async function OwnerStationsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole('owner', 'admin');
  const sp = await searchParams;
  const page = Math.max(Number(sp['page'] ?? '1') || 1, 1);
  const resolvedParams: Record<string, string | undefined> = {
    page: sp['page'] as string | undefined,
  };

  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={null}>
        <FlashToast param="saved" title="Station saved" />
      </Suspense>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[var(--text-primary)]">Stations</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Manage your charging stations.</p>
        </div>
        <Link href="/owner/stations/new">
          <Button>Add station</Button>
        </Link>
      </div>

      <Suspense key={page} fallback={<DataTableSkeleton columnCount={5} />}>
        <StationsTable page={page} searchParams={resolvedParams} />
      </Suspense>
    </div>
  );
}

async function StationsTable({
  page,
  searchParams,
}: {
  readonly page: number;
  readonly searchParams: Record<string, string | undefined>;
}) {
  const supabase = await createSupabaseServerClient();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, count, error } = await supabase
    .from('stations')
    .select('id, name, city, state, status', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error || !data) {
    return (
      <DataTable<StationRow>
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        caption="Your stations"
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={0}
        basePath="/owner/stations"
        searchParams={searchParams}
        emptyTitle="Couldn't load stations"
        errorMessage={error?.message ?? 'Unknown error'}
      />
    );
  }

  const stationIds = data.map((s) => s.id);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [chargersResult, sessionsResult] = await Promise.all([
    stationIds.length > 0
      ? supabase.from('chargers').select('station_id').in('station_id', stationIds)
      : Promise.resolve({ data: [] as { station_id: string }[] }),
    stationIds.length > 0
      ? supabase
          .from('sessions')
          .select('station_id, total_cost')
          .in('station_id', stationIds)
          .eq('status', 'completed')
          .gte('stopped_at', todayStart.toISOString())
      : Promise.resolve({ data: [] as { station_id: string; total_cost: number }[] }),
  ]);

  const chargerCounts = new Map<string, number>();
  for (const c of chargersResult.data ?? []) {
    chargerCounts.set(c.station_id, (chargerCounts.get(c.station_id) ?? 0) + 1);
  }
  const revenueByStation = new Map<string, number>();
  for (const s of sessionsResult.data ?? []) {
    revenueByStation.set(s.station_id, (revenueByStation.get(s.station_id) ?? 0) + s.total_cost);
  }

  const rows: StationRow[] = data.map((s) => ({
    id: s.id,
    name: s.name,
    city: s.city,
    state: s.state,
    status: s.status,
    chargerCount: chargerCounts.get(s.id) ?? 0,
    todayRevenue: revenueByStation.get(s.id) ?? 0,
  }));

  return (
    <DataTable<StationRow>
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      caption="Your stations"
      page={page}
      pageSize={PAGE_SIZE}
      totalCount={count ?? rows.length}
      basePath="/owner/stations"
      searchParams={searchParams}
      emptyTitle="No stations yet"
      emptyDescription="Add your first charging station to start accepting sessions."
    />
  );
}

const columns: readonly DataTableColumn<StationRow>[] = [
  {
    key: 'name',
    header: 'Station',
    render: (row) => (
      <Link href={`/owner/stations/${row.id}`} className="font-medium text-[var(--text-primary)] hover:underline">
        {row.name}
      </Link>
    ),
  },
  { key: 'city', header: 'City', render: (row) => `${row.city}, ${row.state}` },
  { key: 'chargers', header: 'Chargers', render: (row) => row.chargerCount },
  {
    key: 'status',
    header: 'Status',
    render: (row) => {
      const status = presentStatus(STATION_STATUS, row.status);
      return (
        <Badge tone={status.tone} srHint={status.srHint}>
          {status.label}
        </Badge>
      );
    },
  },
  { key: 'revenue', header: "Today's revenue", render: (row) => formatINR(row.todayRevenue) },
];
