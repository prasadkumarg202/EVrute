import 'server-only';

import { timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/lib/env';

/**
 * Authenticates a scheduled-job request with a bearer token compared using
 * `timingSafeEqual`, so response-time cannot be used to brute-force
 * `CRON_SECRET` one byte at a time. Shared by every `app/api/cron/*` route.
 *
 * Fails closed: a missing `CRON_SECRET` rejects every request rather than
 * accepting anything, which would turn a misconfigured deploy into an
 * unauthenticated trigger for settlement generation or session expiry.
 */
export function verifyCronRequest(request: Request): boolean {
  const secret = serverEnv().CRON_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;

  const provided = Buffer.from(authHeader.slice(7));
  const expected = Buffer.from(secret);

  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
