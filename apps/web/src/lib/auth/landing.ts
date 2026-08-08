import type { Database } from '@evrute/db/types';

export type AppRole = Database['public']['Enums']['app_role'];

/**
 * Where a user should land when they sign in without having asked for a
 * specific page.
 *
 * A station owner signing in wants their dashboard, not the driver's map —
 * landing them on the customer surface with no visible route to the portal
 * reads as "the app is broken for me". Admins and support likewise.
 *
 * This is a DEFAULT, not a restriction. Owners and admins can still use the
 * customer app — many of them drive an EV too — and an explicit `?next=`
 * always wins, so a deep link to a station survives the login round trip.
 */
export function defaultLandingFor(role: AppRole | null | undefined): string {
  switch (role) {
    case 'owner':
      return '/owner';
    case 'admin':
    case 'employee':
      return '/admin';
    default:
      return '/';
  }
}

/**
 * Reject anything that isn't a same-origin path. A `next` of
 * `https://evil.example` would otherwise turn our login screen into an open
 * redirect — a phishing primitive, since the URL a victim clicks is ours.
 * `//host` is rejected too: browsers read it as protocol-relative.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}
