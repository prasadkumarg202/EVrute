import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { formatINR, formatKwh, presentStatus, SESSION_STATUS } from '@evrute/core';
import type { Enums } from '@evrute/db';
import { Badge, Card, EmptyState } from '@/components/ui/index';
import { createSupabaseServerClient, getSessionUser } from '@/lib/supabase/server';
import { cn } from '@/lib/utils/cn';

export const metadata: Metadata = {
  title: 'Charging history',
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 15;

type SessionStatus = Enums<'session_status'>;

const STATUS_FILTERS: readonly { readonly value: SessionStatus | 'all'; readonly label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'active', label: 'Active' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

interface PageProps {
  readonly searchParams: Promise<{ readonly page?: string; readonly status?: string }>;
}

export default async function HistoryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect('/login?next=%2Fhistory');

  const page = Math.max(Number.parseInt(params.page ?? '1', 10) || 1, 1);
  const statusFilter = STATUS_FILTERS.some((f) => f.value === params.status)
    ? (params.status as SessionStatus | 'all' | undefined)
    : 'all';
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('sessions')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data: sessions, count } = await query;
  const rows = sessions ?? [];

  const stationIds = [...new Set(rows.map((s) => s.station_id))];
  const { data: stations } =
    stationIds.length > 0
      ? await supabase.from('stations').select('id, name').in('id', stationIds)
      : { data: [] };
  const stationNameById = new Map((stations ?? []).map((s) => [s.id, s.name]));

  const totalPages = count ? Math.max(Math.ceil(count / PAGE_SIZE), 1) : 1;

  return (
    <div className="mx-auto max-w-lg px-4 pt-4 pb-10 sm:px-5">
      <h1 className="font-display text-xl font-semibold text-[var(--text-primary)]">Charging history</h1>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {STATUS_FILTERS.map((filter) => {
          const active = (statusFilter ?? 'all') === filter.value;
          const href = filter.value === 'all' ? '/history' : `/history?status=${filter.value}`;
          return (
            <Link
              key={filter.value}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
                  : 'border-[var(--border-strong)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]',
              )}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="No sessions here yet"
          description="Charging sessions you start will show up in this list."
        />
      ) : (
        <ul className="mt-5 space-y-2.5">
          {rows.map((session) => {
            const status = presentStatus(SESSION_STATUS, session.status);
            const stationName = stationNameById.get(session.station_id) ?? 'Station';
            const hasInvoice = session.status === 'completed';
            const content = (
              <Card className={cn('px-4 py-3.5', hasInvoice && 'transition-colors hover:bg-[var(--surface-sunken)]')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{stationName}</p>
                    <time dateTime={session.created_at} className="text-xs text-[var(--text-muted)]">
                      {new Date(session.created_at).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>
                  <Badge tone={status.tone} srHint={status.srHint}>
                    {status.label}
                  </Badge>
                </div>
                <div className="tabular mt-2 flex items-center gap-4 text-xs text-[var(--text-secondary)]">
                  <span>{formatKwh(session.energy_kwh)}</span>
                  <span>{formatINR(session.total_cost)}</span>
                </div>
              </Card>
            );
            return (
              <li key={session.id}>
                {hasInvoice ? (
                  <Link href={`/history/${session.id}`} className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] rounded-[var(--radius-card)]">
                    {content}
                  </Link>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-between text-sm">
          <PageLink page={page - 1} disabled={page <= 1} status={statusFilter} label="Previous" />
          <span className="tabular text-[var(--text-muted)]">
            Page {page} of {totalPages}
          </span>
          <PageLink page={page + 1} disabled={page >= totalPages} status={statusFilter} label="Next" />
        </nav>
      )}
    </div>
  );
}

function PageLink({
  page,
  disabled,
  status,
  label,
}: {
  readonly page: number;
  readonly disabled: boolean;
  readonly status: SessionStatus | 'all' | undefined;
  readonly label: string;
}) {
  if (disabled) {
    return <span className="cursor-not-allowed px-3 py-1.5 text-[var(--text-muted)]">{label}</span>;
  }
  const params = new URLSearchParams();
  params.set('page', String(page));
  if (status && status !== 'all') params.set('status', status);
  return (
    <Link
      href={`/history?${params.toString()}`}
      className="rounded-lg px-3 py-1.5 font-medium text-[var(--accent)] hover:bg-[var(--surface-sunken)]"
    >
      {label}
    </Link>
  );
}
