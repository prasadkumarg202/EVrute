import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { formatDuration, formatINR, formatKwh, presentStatus, SESSION_STATUS } from '@evrute/core';
import { Badge, Card, CardBody, CardHeader, CardTitle, EmptyState, ErrorState, LoadingRegion, Skeleton, Stat } from '@/components/ui';
import { ActivityChart } from '@/components/charts/activity-chart';
import { parseOwnerDashboard } from '@/lib/dashboard';
import { formatDateTime } from '@/lib/utils/format';
import { requireRole } from '@/lib/supabase/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function OwnerDashboardPage() {
  await requireRole('owner', 'admin');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--text-primary)]">Dashboard</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Your stations, sessions and payouts at a glance.
        </p>
      </div>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <LoadingRegion label="Loading dashboard">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Stat key={i} label="" value="" loading />
        ))}
      </div>
      <Card className="mt-6">
        <CardHeader>
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardBody>
          <Skeleton className="h-64 w-full" />
        </CardBody>
      </Card>
    </LoadingRegion>
  );
}

async function DashboardContent() {
  const supabase = await createSupabaseServerClient();

  const { data: rpcData, error: rpcError } = await supabase.rpc('owner_dashboard', { p_days: 7 });

  if (rpcError || !rpcData) {
    return (
      <Card>
        <ErrorState
          title="Couldn't load your dashboard"
          description={rpcError?.message ?? 'Please try refreshing the page.'}
        />
      </Card>
    );
  }

  const dashboard = parseOwnerDashboard(rpcData);

  const { data: recentSessions, error: sessionsError } = await supabase
    .from('sessions')
    .select('id, status, energy_kwh, total_cost, started_at, stopped_at, station:stations(name), connector:connectors(type)')
    .order('created_at', { ascending: false })
    .limit(8);

  const chartData = dashboard.activity.map((d) => ({
    day: d.day,
    revenue: d.revenue,
    energy_kwh: d.energy_kwh,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Active sessions" value={String(dashboard.activeSessions)} />
        <Stat label="Today's revenue" value={formatINR(dashboard.todayRevenue, true)} />
        <Stat label="Today's energy" value={formatKwh(dashboard.todayEnergyKwh, 1)} />
        <Stat label="Chargers" value={`${dashboard.chargersOnline}/${dashboard.chargerCount}`} sublabel="online" />
        <Stat
          label="Uptime"
          value={`${dashboard.uptimePct.toFixed(1)}%`}
          {...(dashboard.uptimePct >= 95
            ? { tone: 'success' as const }
            : dashboard.uptimePct < 80
              ? { tone: 'danger' as const }
              : {})}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Last 7 days</CardTitle>
          <p className="tabular text-xs text-[var(--text-muted)]">
            Pending payout: <span className="font-medium text-[var(--text-primary)]">{formatINR(dashboard.pendingSettlement)}</span>
          </p>
        </CardHeader>
        <CardBody>
          <ActivityChart
            title="Revenue and energy delivered over the last 7 days"
            data={chartData}
            series={[
              { key: 'revenue', label: 'Revenue', color: 'var(--color-brand-500)', format: 'currency' },
              { key: 'energy_kwh', label: 'Energy', color: 'var(--color-info-500)', format: 'energy' },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent sessions</CardTitle>
          <Link href="/owner/sessions" className="text-sm font-medium text-[var(--accent)] hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardBody className="p-0 sm:p-0">
          {sessionsError || !recentSessions ? (
            <div className="px-4 pb-4 sm:px-5 sm:pb-5">
              <ErrorState title="Couldn't load sessions" {...(sessionsError?.message ? { description: sessionsError.message } : {})} />
            </div>
          ) : recentSessions.length === 0 ? (
            <div className="px-4 pb-4 sm:px-5 sm:pb-5">
              <EmptyState title="No sessions yet" description="Sessions will appear here once drivers start charging." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">Recent charging sessions</caption>
                <thead>
                  <tr className="border-t border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Station</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Connector</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Status</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Energy</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Amount</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSessions.map((session) => {
                    const status = presentStatus(SESSION_STATUS, session.status);
                    const duration =
                      session.started_at && session.stopped_at
                        ? formatDuration((new Date(session.stopped_at).getTime() - new Date(session.started_at).getTime()) / 1000)
                        : null;
                    return (
                      <tr key={session.id} className="border-b border-[var(--border-subtle)] last:border-0">
                        <td className="px-4 py-3 text-[var(--text-primary)]">{session.station?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">{session.connector?.type ?? '—'}</td>
                        <td className="px-4 py-3">
                          <Badge tone={status.tone} srHint={status.srHint}>{status.label}</Badge>
                        </td>
                        <td className="px-4 py-3 tabular text-[var(--text-primary)]">{formatKwh(session.energy_kwh)}</td>
                        <td className="px-4 py-3 tabular text-[var(--text-primary)]">{formatINR(session.total_cost)}</td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">
                          {formatDateTime(session.started_at)}
                          {duration && <span className="ml-1 text-xs text-[var(--text-muted)]">({duration})</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
