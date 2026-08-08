import { Suspense } from 'react';
import type { Metadata } from 'next';
import { formatINR, formatKwh, presentStatus, SESSION_STATUS } from '@evrute/core';
import { Badge, Card, CardBody, CardHeader, CardTitle, EmptyState, ErrorState, LoadingRegion, Skeleton, Stat } from '@/components/ui';
import { ActivityChart } from '@/components/charts/activity-chart';
import { RealtimeRefresher } from '@/components/realtime-refresher';
import { parseAdminDashboard } from '@/lib/dashboard';
import { formatDateTime } from '@/lib/utils/format';
import { requireRole, createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function AdminDashboardPage() {
  await requireRole('admin', 'employee');

  return (
    <div className="flex flex-col gap-6">
      <RealtimeRefresher table="sessions" />
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--text-primary)]">Platform dashboard</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Everything happening on EVRute right now.</p>
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
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
  const { data: rpcData, error: rpcError } = await supabase.rpc('admin_dashboard', { p_days: 7 });

  if (rpcError || !rpcData) {
    return (
      <Card>
        <ErrorState title="Couldn't load the dashboard" {...(rpcError?.message ? { description: rpcError.message } : {})} />
      </Card>
    );
  }

  const dashboard = parseAdminDashboard(rpcData);

  const { data: liveSessions, error: liveError } = await supabase
    .from('sessions')
    .select('id, status, energy_kwh, started_at, stations(name), connectors(type), profiles(full_name)')
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(20);

  const chartData = dashboard.activity.map((d) => ({ day: d.day, revenue: d.revenue, sessions: d.sessions }));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Users" value={String(dashboard.totalUsers)} />
        <Stat label="Owners" value={String(dashboard.totalOwners)} />
        <Stat label="Stations" value={`${dashboard.activeStations}/${dashboard.totalStations}`} sublabel="active" />
        <Stat label="Chargers" value={`${dashboard.chargersOnline}/${dashboard.totalChargers}`} sublabel="online" />
        <Stat label="Active sessions" value={String(dashboard.activeSessions)} />
        <Stat label="Today's revenue" value={formatINR(dashboard.todayRevenue, true)} />
        <Stat label="Today's energy" value={formatKwh(dashboard.todayEnergyKwh, 0)} />
        <Stat
          label="Open tickets"
          value={String(dashboard.openTickets)}
          {...(dashboard.openTickets > 0 ? { tone: 'warning' as const } : {})}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Last 7 days</CardTitle>
          <p className="tabular text-xs text-[var(--text-muted)]">
            Settlements pending:{' '}
            <span className="font-medium text-[var(--text-primary)]">
              {dashboard.settlementsPending} ({formatINR(dashboard.settlementsPendingValue, true)})
            </span>
          </p>
        </CardHeader>
        <CardBody>
          <ActivityChart
            title="Platform revenue and sessions over the last 7 days"
            data={chartData}
            series={[
              { key: 'revenue', label: 'Revenue', color: 'var(--color-brand-500)', format: 'currency' },
              { key: 'sessions', label: 'Sessions', color: 'var(--color-info-500)' },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live sessions across the network</CardTitle>
        </CardHeader>
        <CardBody className="p-0 sm:p-0">
          {liveError || !liveSessions ? (
            <div className="px-4 pb-4 sm:px-5 sm:pb-5">
              <ErrorState title="Couldn't load live sessions" {...(liveError?.message ? { description: liveError.message } : {})} />
            </div>
          ) : liveSessions.length === 0 ? (
            <div className="px-4 pb-4 sm:px-5 sm:pb-5">
              <EmptyState title="No active sessions" description="Sessions will appear here the moment charging starts." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">Currently active charging sessions</caption>
                <thead>
                  <tr className="border-t border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Station</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Connector</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Driver</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Energy so far</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Started</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {liveSessions.map((session) => {
                    const status = presentStatus(SESSION_STATUS, session.status);
                    return (
                      <tr key={session.id} className="border-b border-[var(--border-subtle)] last:border-0">
                        <td className="px-4 py-3 text-[var(--text-primary)]">{session.stations?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">{session.connectors?.type ?? '—'}</td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">{session.profiles?.full_name || 'Driver'}</td>
                        <td className="px-4 py-3 tabular text-[var(--text-primary)]">{formatKwh(session.energy_kwh)}</td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">{formatDateTime(session.started_at)}</td>
                        <td className="px-4 py-3">
                          <Badge tone={status.tone} srHint={status.srHint} pulse dot>
                            {status.label}
                          </Badge>
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
