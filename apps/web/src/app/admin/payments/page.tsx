import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Badge, Card, CardBody } from '@/components/ui';
import { DataTable, DataTableSkeleton, type DataTableColumn } from '@/components/data-table';
import { presentStatus, PAYMENT_STATUS, formatINR } from '@evrute/core';
import { requireRole, createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Payments' };

const PAGE_SIZE = 20;
const STATUSES = ['created', 'authorized', 'captured', 'failed', 'refunded'] as const;
const PROVIDERS = ['razorpay', 'cashfree'] as const;

interface PaymentRow {
  readonly id: string;
  readonly userName: string;
  readonly provider: string;
  readonly purpose: string;
  readonly amount: number;
  readonly refundedAmount: number;
  readonly status: string;
  readonly createdAt: string;
}

export default async function AdminPaymentsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole('admin', 'employee');
  const sp = await searchParams;
  const page = Math.max(Number(sp['page'] ?? '1') || 1, 1);
  const status = typeof sp['status'] === 'string' ? sp['status'] : '';
  const provider = typeof sp['provider'] === 'string' ? sp['provider'] : '';
  const resolvedParams: Record<string, string | undefined> = {
    page: sp['page'] as string | undefined,
    status: status || undefined,
    provider: provider || undefined,
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--text-primary)]">Payments</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Wallet top-ups and session payments.</p>
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
                    {presentStatus(PAYMENT_STATUS, s).label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="provider" className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                Provider
              </label>
              <select
                id="provider"
                name="provider"
                defaultValue={provider}
                className="h-10 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-card)] px-2.5 text-sm text-[var(--text-primary)]"
              >
                <option value="">All providers</option>
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
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

      <Suspense key={`${page}-${status}-${provider}`} fallback={<DataTableSkeleton columnCount={6} />}>
        <PaymentsTable page={page} status={status} provider={provider} searchParams={resolvedParams} />
      </Suspense>
    </div>
  );
}

async function PaymentsTable({
  page,
  status,
  provider,
  searchParams,
}: {
  readonly page: number;
  readonly status: string;
  readonly provider: string;
  readonly searchParams: Record<string, string | undefined>;
}) {
  const supabase = await createSupabaseServerClient();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('payments')
    .select('id, provider, purpose, amount, refunded_amount, status, created_at, profiles(full_name)', {
      count: 'exact',
    })
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status as never);
  if (provider) query = query.eq('provider', provider as never);

  const { data, count, error } = await query.range(from, to);

  if (error || !data) {
    return (
      <DataTable<PaymentRow>
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        caption="Payments"
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={0}
        basePath="/admin/payments"
        searchParams={searchParams}
        emptyTitle="Couldn't load payments"
        errorMessage={error?.message ?? 'Unknown error'}
      />
    );
  }

  const rows: PaymentRow[] = data.map((p) => ({
    id: p.id,
    userName: p.profiles?.full_name || 'Unknown user',
    provider: p.provider,
    purpose: p.purpose,
    amount: p.amount,
    refundedAmount: p.refunded_amount,
    status: p.status,
    createdAt: p.created_at,
  }));

  return (
    <DataTable<PaymentRow>
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      caption="Payments"
      page={page}
      pageSize={PAGE_SIZE}
      totalCount={count ?? rows.length}
      basePath="/admin/payments"
      searchParams={searchParams}
      emptyTitle="No payments found"
      emptyDescription="Nothing matches this filter yet."
    />
  );
}

const columns: readonly DataTableColumn<PaymentRow>[] = [
  { key: 'user', header: 'User', render: (r) => r.userName },
  { key: 'provider', header: 'Provider', render: (r) => r.provider },
  { key: 'purpose', header: 'Purpose', render: (r) => r.purpose.replace('_', ' ') },
  { key: 'amount', header: 'Amount', render: (r) => formatINR(r.amount) },
  {
    key: 'refunded',
    header: 'Refunded',
    render: (r) => (r.refundedAmount > 0 ? formatINR(r.refundedAmount) : '—'),
  },
  {
    key: 'status',
    header: 'Status',
    render: (r) => {
      const s = presentStatus(PAYMENT_STATUS, r.status);
      return (
        <Badge tone={s.tone} srHint={s.srHint}>
          {s.label}
        </Badge>
      );
    },
  },
  { key: 'created', header: 'Created', render: (r) => formatDateTime(r.createdAt) },
];
