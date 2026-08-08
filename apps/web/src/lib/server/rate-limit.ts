import 'server-only';

import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { errorResponse } from '@/lib/server/http';

export interface RateLimitOptions {
  /** Identifies the route being limited, e.g. "sessions:start". */
  readonly bucket: string;
  readonly limit: number;
  readonly windowSecs: number;
}

export type RateLimitResult =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly response: NextResponse };

/** Best-effort client IP extraction behind a proxy/CDN. */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}

/**
 * Fixed-window rate limit backed by `consume_rate_limit`, keyed on
 * (route bucket, client IP). Call at the top of a route handler, before any
 * other work.
 *
 * Fails open on an infrastructure error: a rate-limiter outage must not be
 * able to take checkout or charging down with it, but the failure is still
 * logged so it doesn't go unnoticed.
 */
export async function checkRateLimit(
  request: Request,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const identifier = getClientIp(request);

  // createSupabaseAdminClient() THROWS when SUPABASE_SERVICE_ROLE_KEY is
  // missing. It used to sit outside this try, so a missing key crashed the
  // handler it was supposed to protect — the precise opposite of "fails
  // open", and it surfaced to the browser as an empty 500 body and an
  // "Unexpected end of JSON input" parse error with no clue as to the cause.
  let data: boolean | null;
  try {
    const admin = createSupabaseAdminClient();
    const result = await admin.rpc('consume_rate_limit', {
      p_bucket: options.bucket,
      p_identifier: identifier,
      p_limit: options.limit,
      p_window_secs: options.windowSecs,
    });
    if (result.error) throw new Error(result.error.message);
    data = result.data;
  } catch (error) {
    console.error('rate limit check failed; failing open', {
      bucket: options.bucket,
      error: error instanceof Error ? error.message : String(error),
    });
    return { allowed: true };
  }

  if (data) {
    return { allowed: true };
  }

  return {
    allowed: false,
    response: errorResponse(
      'rate_limited',
      'Too many requests. Please try again shortly.',
      429,
      { 'Retry-After': String(options.windowSecs) },
    ),
  };
}
