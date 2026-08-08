import type { Tables } from '@evrute/db';

export type TariffRow = Tables<'tariffs'>;

/**
 * Mirror of the SQL `resolve_tariff` function, applied client-side to a
 * batch of tariff rows already fetched for a station so the connector list
 * doesn't need one round trip per connector. Connector-type-specific rows
 * win over the station's catch-all row; ties break on the most recent
 * `effective_from`.
 */
export function resolveTariff(
  tariffs: readonly TariffRow[],
  connectorType: string,
  at: Date = new Date(),
): TariffRow | null {
  const atMs = at.getTime();

  const candidates = tariffs.filter((t) => {
    if (t.connector_type !== null && t.connector_type !== connectorType) return false;
    const from = new Date(t.effective_from).getTime();
    const to = t.effective_to ? new Date(t.effective_to).getTime() : null;
    return from <= atMs && (to === null || to > atMs);
  });

  candidates.sort((a, b) => {
    const aTyped = a.connector_type !== null ? 1 : 0;
    const bTyped = b.connector_type !== null ? 1 : 0;
    if (aTyped !== bTyped) return bTyped - aTyped;
    return new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime();
  });

  return candidates[0] ?? null;
}

/** The wallet hold placed at session start — see `start_charging_session`. */
export function requiredHoldAmount(tariff: Pick<TariffRow, 'min_balance_to_start' | 'session_fee'>): number {
  return Math.max(tariff.min_balance_to_start, tariff.session_fee);
}
