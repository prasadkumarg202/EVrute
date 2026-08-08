import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Badge, Card, CardBody } from '@/components/ui';
import { DataTable, DataTableSkeleton, type DataTableColumn } from '@/components/data-table';
import { SettlementProcessAction } from '@/components/admin/settlement-process-action';
import { presentStatus, SETTLEMENT_STATUS, formatINR, formatKwh } from '@evrute/core';
import { requireRole, createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Settlements' };

const PAGE_SIZE = 15;
const STATUSES = ['pending', 'approved', 'processing', 'paid', 'failed'] as const;

interface SettlementRow {
  readonly id: string;
  readonly ownerName: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly grossAmount: number;
  readonly netAmount: number;
  readonly status: string;
  readonly sessionsCount: number;
}

export default async function AdminSettlementsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole('admin', 'employee');
  const sp = await searchParams;
  const page = Math.max(Number(sp['page'] ?? '1') || 1, 1);
  const status = typeof sp['status'] === 'string' ? sp['status'] : '';
  const resolvedParams: Record<string, string | undefined> = {
    page: sp['page'] as string | undefined,
    status: status || undefined,
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--text-primary)]">Settlements</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">The payout queue across every owner.</p>
      </div>

      <Card>
        <CardBody>
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div>
              <label htmlFor="status" className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                Status
              </label>
              <select
                id="status"
                name="status"
                defaultValue={status}
                className="h-10 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-card)] px-2.5 text-sm text-[var(--text-primary)]"
              >
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {presentStatus(SETTLEMENT_STATUS, s).label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="inline-flex h-10 items-center rounded-lg bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-text)] hover:bg-[var(--accent-hover)]"
            >
              Apply
            </button>
          </form>
        </CardBody>
      </Card>

      <Suspense key={`${page}-${status}`} fallback={<DataTableSkeleton columnCount={6} />}>
        <SettlementsTable page={page} status={status} searchParams={resolvedParams} />
      </Suspense>
    </div>
  );
}

async function SettlementsTable({
  page,
  status,
  searchParams,
}: {
  readonly page: number;
  readonly status: string;
  readonly searchParams: Record<string, string | undefined>;
}) {
  const supabase = await createSupabaseServerClient();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('settlements')
    .select(
      'id, owner_id, period_start, period_end, gross_amount, net_amount, status, sessions_count, profiles!settlements_owner_id_fkey(full_name)',
      { count: 'exact' },
    )
    .order('period_start', { ascending: false });

  if (status) query = query.eq('status', status as never);

  const { data, count, error } = await query.range(from, to);

  const columns: readonly DataTableColumn<SettlementRow>[] = [
    { key: 'owner', header: 'Owner', render: (r) => r.ownerName },
    { key: 'period', header: 'Period', render: (r) => `${formatDate(r.periodStart)} – ${formatDate(r.periodEnd)}` },
    { key: 'sessions', header: 'Sessions', render: (r) => r.sessionsCount },
    { key: 'gross', header: 'Gross', render: (r) => formatINR(r.grossAmount) },
    { key: 'net', header: 'Net payout', render: (r) => formatINR(r.netAmount) },
    {
      key: 'status',
      header: 'Status',
      render: (r) => {
        const s = presentStatus(SETTLEMENT_STATUS, r.status);
        return (
          <Badge tone={s.tone} srHint={s.srHint}>
            {s.label}
          </Badge>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) =>
        r.status === 'pending' || r.status === 'approved' ? (
          <SettlementProcessAction settlementId={r.id} ownerName={r.ownerName} netAmount={r.netAmount} />
        ) : (
          <span className="text-xs text-[var(--text-muted)]">—</span>
        ),
    },
  ];

  if (error || !data) {
    return (
      <DataTable<SettlementRow>
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        caption="Settlements"
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={0}
        basePath="/admin/settlements"
        searchParams={searchParams}
        emptyTitle="Couldn't load settlements"
        errorMessage={error?.message ?? 'Unknown error'}
      />
    );
  }

  const rows: SettlementRow[] = data.map((s) => ({
    id: s.id,
    ownerName: s.profiles?.full_name || 'Unknown owner',
    periodStart: s.period_start,
    periodEnd: s.period_end,
    grossAmount: s.gross_amount,
    netAmount: s.net_amount,
    status: s.status,
    sessionsCount: s.sessions_count,
  }));

  const settlementIds = rows.map((r) => r.id);
  const { data: items } = await supabase
    .from('settlement_items')
    .select('id, settlement_id, energy_kwh, gross_amount, commission_amount, net_amount, stations(name)')
    .in('settlement_id', settlementIds);

  type SettlementItemRow = NonNullable<typeof items>[number];
  const itemsBySettlement = new Map<string, SettlementItemRow[]>();
  for (const item of items ?? []) {
    const list = itemsBySettlement.get(item.settlement_id) ?? [];
    list.push(item);
    itemsBySettlement.set(item.settlement_id, list);
  }

  return (
    <DataTable<SettlementRow>
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      caption="Settlements"
      page={page}
      pageSize={PAGE_SIZE}
      totalCount={count ?? rows.length}
      basePath="/admin/settlements"
      searchParams={searchParams}
      emptyTitle="No settlements found"
      emptyDescription="Nothing matches this filter yet."
      getRowLabel={(r) => `settlement for ${r.ownerName}`}
      renderExpanded={(r) => {
        const settlementItems = itemsBySettlement.get(r.id) ?? [];
        if (settlementItems.length === 0) {
          return <p className="text-sm text-[var(--text-muted)]">No line items recorded.</p>;
        }
        return (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <caption className="sr-only">Line items for this settlement</caption>
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  <th scope="col" className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-[var(--text-muted)]">Station</th>
                  <th scope="col" className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-[var(--text-muted)]">Energy</th>
                  <th scope="col" className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-[var(--text-muted)]">Gross</th>
                  <th scope="col" className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-[var(--text-muted)]">Commission</th>
                  <th scope="col" className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-[var(--text-muted)]">Net</th>
                </tr>
              </thead>
              <tbody>
                {settlementItems.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--border-subtle)] last:border-0">
                    <td className="px-2 py-1.5 text-[var(--text-primary)]">{item.stations?.name ?? '—'}</td>
                    <td className="px-2 py-1.5 tabular text-[var(--text-primary)]">{formatKwh(item.energy_kwh)}</td>
                    <td className="px-2 py-1.5 tabular text-[var(--text-primary)]">{formatINR(item.gross_amount)}</td>
                    <td className="px-2 py-1.5 tabular text-[var(--text-primary)]">{formatINR(item.commission_amount)}</td>
                    <td className="px-2 py-1.5 tabular text-[var(--text-primary)]">{formatINR(item.net_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }}
    />
  );
}
