import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Badge, Stat } from '@/components/ui';
import { DataTable, DataTableSkeleton, type DataTableColumn } from '@/components/data-table';
import { presentStatus, SETTLEMENT_STATUS, formatINR, formatKwh } from '@evrute/core';
import { requireRole, createSupabaseServerClient } from '@/lib/supabase/server';
import { addDays, formatDate } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Settlements' };

const PAGE_SIZE = 15;

interface SettlementRow {
  readonly id: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly grossAmount: number;
  readonly commissionAmount: number;
  readonly commissionPct: number;
  readonly gstAmount: number;
  readonly tdsAmount: number;
  readonly netAmount: number;
  readonly status: string;
  readonly sessionsCount: number;
  readonly energyKwh: number;
}

export default async function OwnerSettlementsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole('owner', 'admin');
  const sp = await searchParams;
  const page = Math.max(Number(sp['page'] ?? '1') || 1, 1);
  const resolvedParams: Record<string, string | undefined> = { page: sp['page'] as string | undefined };

  const supabase = await createSupabaseServerClient();

  const [{ data: pendingRows }, { data: lastPaid }, { data: ownerStations }] = await Promise.all([
    supabase.from('settlements').select('net_amount').in('status', ['pending', 'approved', 'processing']),
    supabase
      .from('settlements')
      .select('net_amount, paid_at')
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('stations').select('settlement_cycle_days').eq('owner_id', user.id),
  ]);

  const pendingTotal = (pendingRows ?? []).reduce((sum, r) => sum + r.net_amount, 0);
  const cycleDays = ownerStations?.[0]?.settlement_cycle_days ?? 7;
  const nextPayoutEstimate = addDays(new Date(), cycleDays);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--text-primary)]">Settlements</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Your payout history and pending balance.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Pending payout" value={formatINR(pendingTotal)} />
        <Stat
          label="Last payout"
          value={lastPaid ? formatINR(lastPaid.net_amount) : '—'}
          sublabel={lastPaid?.paid_at ? formatDate(lastPaid.paid_at) : 'No payouts yet'}
        />
        <Stat label="Estimated next payout" value={formatDate(nextPayoutEstimate.toISOString())} sublabel={`Every ${cycleDays} days`} />
      </div>

      <Suspense key={page} fallback={<DataTableSkeleton columnCount={7} />}>
        <SettlementsTable page={page} searchParams={resolvedParams} />
      </Suspense>
    </div>
  );
}

async function SettlementsTable({
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
    .from('settlements')
    .select('*', { count: 'exact' })
    .order('period_start', { ascending: false })
    .range(from, to);

  if (error || !data) {
    return (
      <DataTable<SettlementRow>
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        caption="Settlement history"
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={0}
        basePath="/owner/settlements"
        searchParams={searchParams}
        emptyTitle="Couldn't load settlements"
        errorMessage={error?.message ?? 'Unknown error'}
      />
    );
  }

  const settlementIds = data.map((s) => s.id);
  const { data: items } = await supabase
    .from('settlement_items')
    .select('id, settlement_id, session_id, station_id, energy_kwh, gross_amount, commission_amount, net_amount, stations(name)')
    .in('settlement_id', settlementIds);

  type SettlementItemRow = NonNullable<typeof items>[number];
  const itemsBySettlement = new Map<string, SettlementItemRow[]>();
  for (const item of items ?? []) {
    const list = itemsBySettlement.get(item.settlement_id) ?? [];
    list.push(item);
    itemsBySettlement.set(item.settlement_id, list);
  }

  const rows: SettlementRow[] = data.map((s) => ({
    id: s.id,
    periodStart: s.period_start,
    periodEnd: s.period_end,
    grossAmount: s.gross_amount,
    commissionAmount: s.commission_amount,
    commissionPct: s.commission_pct,
    gstAmount: s.gst_amount,
    tdsAmount: s.tds_amount,
    netAmount: s.net_amount,
    status: s.status,
    sessionsCount: s.sessions_count,
    energyKwh: s.energy_kwh,
  }));

  return (
    <DataTable<SettlementRow>
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      caption="Settlement history"
      page={page}
      pageSize={PAGE_SIZE}
      totalCount={count ?? rows.length}
      basePath="/owner/settlements"
      searchParams={searchParams}
      emptyTitle="No settlements yet"
      emptyDescription="Settlements are generated automatically once sessions complete."
      getRowLabel={(r) => `settlement for ${formatDate(r.periodStart)}–${formatDate(r.periodEnd)}`}
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

const columns: readonly DataTableColumn<SettlementRow>[] = [
  { key: 'period', header: 'Period', render: (r) => `${formatDate(r.periodStart)} – ${formatDate(r.periodEnd)}` },
  { key: 'sessions', header: 'Sessions', render: (r) => r.sessionsCount },
  { key: 'gross', header: 'Gross', render: (r) => formatINR(r.grossAmount) },
  { key: 'commission', header: 'Commission', render: (r) => `${formatINR(r.commissionAmount)} (${r.commissionPct}%)` },
  { key: 'gst', header: 'GST', render: (r) => formatINR(r.gstAmount) },
  { key: 'tds', header: 'TDS', render: (r) => formatINR(r.tdsAmount) },
  { key: 'net', header: 'Net payout', render: (r) => formatINR(r.netAmount) },
  {
    key: 'status',
    header: 'Status',
    render: (r) => {
      const status = presentStatus(SETTLEMENT_STATUS, r.status);
      return (
        <Badge tone={status.tone} srHint={status.srHint}>
          {status.label}
        </Badge>
      );
    },
  },
];
