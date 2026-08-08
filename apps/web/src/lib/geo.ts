/**
 * Distance and coordinate helpers shared by the map/search screen and the
 * station list. Kept separate from `@evrute/core` because these are purely
 * presentational — the actual proximity search happens in Postgres via
 * `search_stations`.
 */

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

/** Default search origin when geolocation is unavailable or denied. */
export const DEFAULT_CENTER: LatLng = { lat: 17.4485, lng: 78.3813 };

export function formatDistance(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

/** Equirectangular approximation — fine at the scale of a single city's map. */
export function projectRelative(origin: LatLng, point: LatLng): { readonly dx: number; readonly dy: number } {
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * Math.cos((origin.lat * Math.PI) / 180);
  return {
    dx: (point.lng - origin.lng) * metersPerDegLng,
    dy: (origin.lat - point.lat) * metersPerDegLat, // screen y grows downward
  };
}
