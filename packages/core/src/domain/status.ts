/**
 * A single status -> presentation mapping shared by the customer PWA, the
 * owner portal and the admin panel.
 *
 * The handoff spec calls this out explicitly: status colours must be
 * consistent across all three surfaces, and per-screen ad-hoc mapping is
 * how they drift. Every badge in the product resolves through here.
 *
 * Accessibility: every status carries a `label` as well as a colour.
 * WCAG 1.4.1 forbids colour as the only carrier of meaning, and a
 * red/green connector indicator is unreadable to ~8% of men.
 */

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface StatusPresentation {
  readonly label: string;
  readonly tone: StatusTone;
  /** Short text for screen readers when the badge is icon-only. */
  readonly srHint: string;
}

export const CONNECTOR_STATUS: Record<string, StatusPresentation> = {
  available: { label: 'Available', tone: 'success', srHint: 'Connector is free to use' },
  occupied: { label: 'In use', tone: 'warning', srHint: 'Connector is currently charging a vehicle' },
  reserved: { label: 'Reserved', tone: 'info', srHint: 'Connector is reserved by another driver' },
  offline: { label: 'Offline', tone: 'neutral', srHint: 'Connector is not reachable' },
  faulted: { label: 'Faulted', tone: 'danger', srHint: 'Connector has reported a fault' },
};

export const CHARGER_STATUS: Record<string, StatusPresentation> = {
  online: { label: 'Online', tone: 'success', srHint: 'Charger is connected' },
  offline: { label: 'Offline', tone: 'neutral', srHint: 'Charger is not connected' },
  faulted: { label: 'Faulted', tone: 'danger', srHint: 'Charger has reported a fault' },
  maintenance: { label: 'Maintenance', tone: 'warning', srHint: 'Charger is under maintenance' },
};

export const STATION_STATUS: Record<string, StatusPresentation> = {
  draft: { label: 'Draft', tone: 'neutral', srHint: 'Station is not published' },
  under_review: { label: 'Under review', tone: 'info', srHint: 'Station is awaiting approval' },
  active: { label: 'Active', tone: 'success', srHint: 'Station is live' },
  maintenance: { label: 'Maintenance', tone: 'warning', srHint: 'Station is temporarily closed' },
  suspended: { label: 'Suspended', tone: 'danger', srHint: 'Station has been suspended' },
};

export const SESSION_STATUS: Record<string, StatusPresentation> = {
  pending: { label: 'Starting', tone: 'info', srHint: 'Waiting for the charger to respond' },
  active: { label: 'Charging', tone: 'success', srHint: 'Charging in progress' },
  completed: { label: 'Completed', tone: 'neutral', srHint: 'Session finished' },
  failed: { label: 'Failed', tone: 'danger', srHint: 'Session failed' },
  cancelled: { label: 'Cancelled', tone: 'neutral', srHint: 'Session was cancelled' },
};

export const SETTLEMENT_STATUS: Record<string, StatusPresentation> = {
  pending: { label: 'Pending', tone: 'warning', srHint: 'Awaiting approval' },
  approved: { label: 'Approved', tone: 'info', srHint: 'Approved, queued for payout' },
  processing: { label: 'Processing', tone: 'info', srHint: 'Payout in progress' },
  paid: { label: 'Paid', tone: 'success', srHint: 'Payout completed' },
  failed: { label: 'Failed', tone: 'danger', srHint: 'Payout failed' },
};

export const PAYMENT_STATUS: Record<string, StatusPresentation> = {
  created: { label: 'Pending', tone: 'warning', srHint: 'Payment not yet completed' },
  authorized: { label: 'Authorised', tone: 'info', srHint: 'Payment authorised' },
  captured: { label: 'Successful', tone: 'success', srHint: 'Payment successful' },
  failed: { label: 'Failed', tone: 'danger', srHint: 'Payment failed' },
  refunded: { label: 'Refunded', tone: 'neutral', srHint: 'Payment refunded' },
};

export const TICKET_STATUS: Record<string, StatusPresentation> = {
  open: { label: 'Open', tone: 'warning', srHint: 'Ticket is open' },
  in_progress: { label: 'In progress', tone: 'info', srHint: 'Ticket is being worked on' },
  resolved: { label: 'Resolved', tone: 'success', srHint: 'Ticket resolved' },
  closed: { label: 'Closed', tone: 'neutral', srHint: 'Ticket closed' },
};

const FALLBACK: StatusPresentation = { label: 'Unknown', tone: 'neutral', srHint: 'Status unknown' };

export function presentStatus(
  map: Record<string, StatusPresentation>,
  status: string | null | undefined,
): StatusPresentation {
  if (!status) return FALLBACK;
  return map[status] ?? { label: humanise(status), tone: 'neutral', srHint: humanise(status) };
}

function humanise(value: string): string {
  const spaced = value.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export const CONNECTOR_TYPE_LABELS: Record<string, string> = {
  CCS2: 'CCS2',
  TYPE2: 'Type 2',
  GBT: 'GB/T',
  CHADEMO: 'CHAdeMO',
  AC_3PIN: '3-pin AC',
};

export function connectorTypeLabel(type: string | null | undefined): string {
  if (!type) return 'Unknown';
  return CONNECTOR_TYPE_LABELS[type] ?? type;
}
