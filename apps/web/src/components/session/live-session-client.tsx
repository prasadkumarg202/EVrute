'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Tables } from '@evrute/db';
import {
  connectorTypeLabel,
  formatDuration,
  formatINR,
  formatKwh,
  presentStatus,
  SESSION_STATUS,
} from '@evrute/core';
import { Badge, Button, Sheet } from '@/components/ui/index';
import { useToast } from '@/components/ui/toast';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type SessionRow = Tables<'sessions'>;
type StationInfo = Pick<Tables<'stations'>, 'name' | 'slug' | 'address_line1' | 'city'> | null;
type ConnectorInfo = Pick<Tables<'connectors'>, 'type' | 'power_kw' | 'connector_number' | 'current_type'> | null;

const ACTIVE_SESSION_STORAGE_KEY = 'evrute-active-session';
const POLL_INTERVAL_MS = 10_000;
const TICK_INTERVAL_MS = 1000;

const LIVE_STATUSES = new Set<SessionRow['status']>(['pending', 'active']);

export function LiveSessionClient({
  initialSession,
  station,
  connector,
}: {
  readonly initialSession: SessionRow;
  readonly station: StationInfo;
  readonly connector: ConnectorInfo;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const toast = useToast();

  const [session, setSession] = useState(initialSession);
  const [latestMeter, setLatestMeter] = useState<Tables<'meter_readings'> | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [confirmStopOpen, setConfirmStopOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [realtimeDegraded, setRealtimeDegraded] = useState(false);

  const isLive = LIVE_STATUSES.has(session.status);

  // Persist the in-progress session id so a backgrounded/killed PWA can
  // reconcile on resume instead of silently losing track of an active charge.
  useEffect(() => {
    if (isLive) {
      localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, session.id);
    } else if (localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY) === session.id) {
      localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    }
  }, [isLive, session.id]);

  const refetch = useCallback(async () => {
    const { data } = await supabase.from('sessions').select('*').eq('id', session.id).maybeSingle();
    if (data) setSession(data);

    const { data: meters } = await supabase
      .from('meter_readings')
      .select('*')
      .eq('session_id', session.id)
      .order('recorded_at', { ascending: false })
      .limit(1);
    if (meters && meters[0]) setLatestMeter(meters[0]);
  }, [supabase, session.id]);

  // Realtime subscription: session row updates and new meter readings.
  // Falls back to polling if the channel errors or times out.
  useEffect(() => {
    if (!isLive) return undefined;

    let channel: RealtimeChannel | null = null;
    let pollHandle: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (pollHandle) return;
      setRealtimeDegraded(true);
      pollHandle = setInterval(() => void refetch(), POLL_INTERVAL_MS);
    };

    channel = supabase
      .channel(`session:${session.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${session.id}` },
        (payload) => setSession(payload.new as SessionRow),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'meter_readings', filter: `session_id=eq.${session.id}` },
        (payload) => setLatestMeter(payload.new as Tables<'meter_readings'>),
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          startPolling();
        } else if (status === 'SUBSCRIBED') {
          setRealtimeDegraded(false);
        }
      });

    return () => {
      if (channel) void supabase.removeChannel(channel);
      if (pollHandle) clearInterval(pollHandle);
    };
  }, [supabase, session.id, isLive, refetch]);

  // Reconcile immediately when the tab regains focus/visibility — a
  // realtime channel that was suspended in the background can miss events.
  useEffect(() => {
    if (!isLive) return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refetch();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [isLive, refetch]);

  // Local ticking clock for the elapsed-time readout — purely visual, not
  // part of the aria-live region below.
  useEffect(() => {
    if (!isLive) return undefined;
    const handle = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [isLive]);

  const elapsedSeconds = useMemo(() => {
    if (session.status === 'completed' || session.status === 'failed' || session.status === 'cancelled') {
      return session.duration_seconds;
    }
    if (!session.started_at) return 0;
    return Math.max(Math.floor((now - new Date(session.started_at).getTime()) / 1000), 0);
  }, [now, session]);

  const energyKwh = latestMeter && latestMeter.energy_kwh > session.energy_kwh ? latestMeter.energy_kwh : session.energy_kwh;
  const socPct = latestMeter?.soc_pct ?? session.soc_end_pct;
  const powerKw = latestMeter?.power_kw ?? null;

  async function handleStop() {
    setStopping(true);
    const { data, error } = await supabase.rpc('stop_charging_session', {
      p_session_id: session.id,
      p_reason: 'user_request',
    });
    setStopping(false);
    setConfirmStopOpen(false);

    if (error || !data) {
      toast.push({
        tone: 'danger',
        title: 'Could not stop charging',
        description: error?.message ?? 'Please try again.',
      });
      return;
    }
    setSession(data);
    toast.push({
      tone: 'success',
      title: 'Charging stopped',
      description: `${formatKwh(data.energy_kwh)} delivered for ${formatINR(data.total_cost)}.`,
    });
  }

  const statusPresentation = presentStatus(SESSION_STATUS, session.status);
  const socRingCircumference = 2 * Math.PI * 42;
  const socRingOffset = socPct != null ? socRingCircumference * (1 - socPct / 100) : socRingCircumference;

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)] pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] sm:px-5">
      <div className="flex items-center justify-between">
        <Link
          href={station ? `/station/${station.slug}` : '/'}
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <svg viewBox="0 0 24 24" fill="none" className="size-3.5" aria-hidden="true">
            <path d="M15 6 9 12l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {station?.name ?? 'Station'}
        </Link>
        <Badge tone={statusPresentation.tone} pulse={session.status === 'active'} srHint={statusPresentation.srHint}>
          {statusPresentation.label}
        </Badge>
      </div>

      {realtimeDegraded && isLive && (
        <p role="status" className="mt-2 text-xs text-warning-600 dark:text-warning-500">
          Live updates are delayed — refreshing every 10 seconds instead.
        </p>
      )}

      <div className="mt-2 text-sm text-[var(--text-secondary)]">
        {connector ? `${connectorTypeLabel(connector.type)} · Connector ${connector.connector_number ?? '—'}` : 'Connector'}
        {station ? ` · ${station.city}` : ''}
      </div>

      <div className="mt-8 flex flex-1 flex-col items-center justify-center">
        <div className="relative flex size-56 items-center justify-center">
          <svg viewBox="0 0 96 96" className="size-56 -rotate-90" aria-hidden="true">
            <circle cx="48" cy="48" r="42" fill="none" stroke="var(--surface-sunken)" strokeWidth="8" />
            <circle
              cx="48"
              cy="48"
              r="42"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={socRingCircumference}
              strokeDashoffset={socRingOffset}
              className="transition-[stroke-dashoffset] duration-700 ease-out"
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="tabular font-display text-3xl font-semibold text-[var(--text-primary)]">
              {socPct != null ? `${socPct}%` : '—'}
            </span>
            <span className="text-xs text-[var(--text-muted)]">Battery</span>
          </div>
        </div>

        <p className="tabular mt-6 text-center font-display text-2xl font-semibold text-[var(--text-primary)]">
          {formatDuration(elapsedSeconds)}
        </p>
        <p className="text-center text-xs text-[var(--text-muted)]">
          {session.status === 'pending' ? 'Waiting for the charger to respond…' : 'Elapsed time'}
        </p>

        <div aria-live="polite" className="mt-6 grid w-full grid-cols-2 gap-3">
          <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 text-center">
            <p className="tabular font-display text-xl font-semibold text-[var(--text-primary)]">
              {formatKwh(energyKwh)}
            </p>
            <p className="text-xs text-[var(--text-muted)]">Energy delivered</p>
          </div>
          <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 text-center">
            <p className="tabular font-display text-xl font-semibold text-[var(--text-primary)]">
              {formatINR(session.total_cost)}
            </p>
            <p className="text-xs text-[var(--text-muted)]">Running cost</p>
          </div>
          {powerKw != null && (
            <div className="col-span-2 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 text-center">
              <p className="tabular text-sm font-medium text-[var(--text-primary)]">{powerKw.toFixed(1)} kW right now</p>
            </div>
          )}
        </div>
      </div>

      {isLive ? (
        <Button
          variant="danger"
          size="lg"
          fullWidth
          onClick={() => setConfirmStopOpen(true)}
          className="mt-6"
        >
          Stop charging
        </Button>
      ) : (
        <div className="mt-6 space-y-3">
          <p className="text-center text-sm text-[var(--text-secondary)]">
            {session.status === 'completed'
              ? `Session complete. ${formatKwh(session.energy_kwh)} for ${formatINR(session.total_cost)}.`
              : session.status === 'cancelled'
                ? 'This session was cancelled — you were not charged.'
                : (session.failure_message ?? 'This session did not complete — you were not charged.')}
          </p>
          <Link
            href="/history"
            className="block w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-center text-sm font-medium text-[var(--accent-text)] hover:bg-[var(--accent-hover)]"
          >
            View history
          </Link>
        </div>
      )}

      <Sheet
        open={confirmStopOpen}
        onClose={() => setConfirmStopOpen(false)}
        title="Stop charging?"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setConfirmStopOpen(false)}>
              Keep charging
            </Button>
            <Button variant="danger" fullWidth loading={stopping} onClick={() => void handleStop()}>
              Stop charging
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[var(--text-secondary)]">
          This ends the session now. You&apos;ll be charged for {formatKwh(energyKwh)} delivered so far
          — about {formatINR(session.total_cost)}.
        </p>
      </Sheet>
    </div>
  );
}
