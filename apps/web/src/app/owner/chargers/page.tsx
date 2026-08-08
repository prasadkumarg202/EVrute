import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Badge } from '@/components/ui';
import { DataTable, DataTableSkeleton, type DataTableColumn } from '@/components/data-table';
import { presentStatus, CHARGER_STATUS } from '@evrute/core';
import { requireRole, createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Chargers' };

const PAGE_SIZE = 20;

interface ChargerRow {
  readonly id: string;
  readonly label: string;
  readonly status: string;
  readonly powerKw: number;
  readonly ocppVersion: string;
  readonly stationId: string;
  readonly stationName: string;
  readonly connectorCount: number;
}

export default async function OwnerChargersPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole('owner', 'admin');
  const sp = await searchParams;
  const page = Math.max(Number(sp['page'] ?? '1') || 1, 1);
  const resolvedParams: Record<string, string | undefined> = { page: sp['page'] as string | undefined };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--text-primary)]">Chargers</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Every charger across your stations.</p>
      </div>
      <Suspense key={page} fallback={<DataTableSkeleton columnCount={6} />}>
        <ChargersTable page={page} searchParams={resolvedParams} />
      </Suspense>
    </div>
  );
}

async function ChargersTable({
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
    .from('chargers')
    .select('id, label, status, power_kw, ocpp_version, station_id, stations(name), connectors(id)', { count: 'exact' })
    .order('label')
    .range(from, to);

  if (error || !data) {
    return (
      <DataTable<ChargerRow>
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        caption="Chargers"
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={0}
        basePath="/owner/chargers"
        searchParams={searchParams}
        emptyTitle="Couldn't load chargers"
        errorMessage={error?.message ?? 'Unknown error'}
      />
    );
  }

  const rows: ChargerRow[] = data.map((c) => ({
    id: c.id,
    label: c.label,
    status: c.status,
    powerKw: c.power_kw,
    ocppVersion: c.ocpp_version,
    stationId: c.station_id,
    stationName: c.stations?.name ?? '—',
    connectorCount: c.connectors?.length ?? 0,
  }));

  return (
    <DataTable<ChargerRow>
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      caption="Chargers"
      page={page}
      pageSize={PAGE_SIZE}
      totalCount={count ?? rows.length}
      basePath="/owner/chargers"
      searchParams={searchParams}
      emptyTitle="No chargers yet"
      emptyDescription="Add a station, then add chargers to it."
    />
  );
}

const columns: readonly DataTableColumn<ChargerRow>[] = [
  { key: 'label', header: 'Charger', render: (r) => r.label },
  {
    key: 'station',
    header: 'Station',
    render: (r) => (
      <Link href={`/owner/stations/${r.stationId}/chargers`} className="text-[var(--accent)] hover:underline">
        {r.stationName}
      </Link>
    ),
  },
  { key: 'connectors', header: 'Connectors', render: (r) => r.connectorCount },
  { key: 'power', header: 'Power', render: (r) => `${r.powerKw} kW` },
  { key: 'ocpp', header: 'OCPP', render: (r) => r.ocppVersion },
  {
    key: 'status',
    header: 'Status',
    render: (r) => {
      const status = presentStatus(CHARGER_STATUS, r.status);
      return (
        <Badge tone={status.tone} srHint={status.srHint}>
          {status.label}
        </Badge>
      );
    },
  },
];
