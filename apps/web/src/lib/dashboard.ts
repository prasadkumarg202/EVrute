import type { Json } from '@evrute/db/types';

/**
 * `owner_dashboard` / `admin_dashboard` return `jsonb`, so PostgREST hands
 * the client an untyped `Json`. These parsers pull out the exact shape the
 * RPCs are documented to return, with safe numeric fallbacks — a stat tile
 * showing 0 is honest, a stat tile that crashes the dashboard is not.
 */

function asRecord(value: Json | undefined): Record<string, Json> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, Json>;
  }
  return {};
}

function asNumber(value: Json | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asArray(value: Json | undefined): readonly Json[] {
  return Array.isArray(value) ? value : [];
}

export interface OwnerActivityDay {
  readonly day: string;
  readonly energy_kwh: number;
  readonly revenue: number;
  readonly sessions: number;
}

export interface OwnerDashboard {
  readonly activeSessions: number;
  readonly todayRevenue: number;
  readonly todayEnergyKwh: number;
  readonly stationCount: number;
  readonly chargerCount: number;
  readonly chargersOnline: number;
  readonly uptimePct: number;
  readonly pendingSettlement: number;
  readonly activity: readonly OwnerActivityDay[];
}

export function parseOwnerDashboard(json: Json): OwnerDashboard {
  const root = asRecord(json);
  const activity = asArray(root['activity']).map((entry) => {
    const row = asRecord(entry);
    return {
      day: typeof row['day'] === 'string' ? row['day'] : '',
      energy_kwh: asNumber(row['energy_kwh']),
      revenue: asNumber(row['revenue']),
      sessions: asNumber(row['sessions']),
    };
  });

  return {
    activeSessions: asNumber(root['active_sessions']),
    todayRevenue: asNumber(root['today_revenue']),
    todayEnergyKwh: asNumber(root['today_energy_kwh']),
    stationCount: asNumber(root['station_count']),
    chargerCount: asNumber(root['charger_count']),
    chargersOnline: asNumber(root['chargers_online']),
    uptimePct: asNumber(root['uptime_pct']),
    pendingSettlement: asNumber(root['pending_settlement']),
    activity,
  };
}

export interface AdminActivityDay {
  readonly day: string;
  readonly revenue: number;
  readonly energy_kwh: number;
  readonly sessions: number;
  readonly active_users: number;
}

export interface AdminDashboard {
  readonly totalUsers: number;
  readonly totalOwners: number;
  readonly totalStations: number;
  readonly activeStations: number;
  readonly totalChargers: number;
  readonly chargersOnline: number;
  readonly activeSessions: number;
  readonly todayRevenue: number;
  readonly todayEnergyKwh: number;
  readonly settlementsPending: number;
  readonly settlementsPendingValue: number;
  readonly openTickets: number;
  readonly activity: readonly AdminActivityDay[];
}

export function parseAdminDashboard(json: Json): AdminDashboard {
  const root = asRecord(json);
  const activity = asArray(root['activity']).map((entry) => {
    const row = asRecord(entry);
    return {
      day: typeof row['day'] === 'string' ? row['day'] : '',
      revenue: asNumber(row['revenue']),
      energy_kwh: asNumber(row['energy_kwh']),
      sessions: asNumber(row['sessions']),
      active_users: asNumber(row['active_users']),
    };
  });

  return {
    totalUsers: asNumber(root['total_users']),
    totalOwners: asNumber(root['total_owners']),
    totalStations: asNumber(root['total_stations']),
    activeStations: asNumber(root['active_stations']),
    totalChargers: asNumber(root['total_chargers']),
    chargersOnline: asNumber(root['chargers_online']),
    activeSessions: asNumber(root['active_sessions']),
    todayRevenue: asNumber(root['today_revenue']),
    todayEnergyKwh: asNumber(root['today_energy_kwh']),
    settlementsPending: asNumber(root['settlements_pending']),
    settlementsPendingValue: asNumber(root['settlements_pending_value']),
    openTickets: asNumber(root['open_tickets']),
    activity,
  };
}
