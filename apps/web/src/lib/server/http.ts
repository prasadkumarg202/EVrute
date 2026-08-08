import 'server-only';

import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { PostgrestError } from '@supabase/supabase-js';
import { AuthError } from '@/lib/supabase/server';
import { ConfigurationError } from '@/lib/env';

/**
 * Shared JSON error shape for every route handler in this app.
 *
 * Never put raw error text or a stack trace in `message` for a 500 — log
 * it server-side under `correlationId` and hand the client only that id.
 * Domain errors (4xx) may surface their message; it is text we authored
 * ourselves in an RPC's `raise exception`, not something vendor- or
 * stack-trace-shaped.
 */
export type ErrorCode =
  | 'bad_request'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  /** A required server-side credential or setting is absent. Distinct from
   *  'internal_error' so an operator can tell "you forgot to configure this"
   *  apart from "something broke". Always 503, never 500. */
  | 'not_configured'
  | 'internal_error';

export function errorResponse(
  code: ErrorCode,
  message: string,
  status: number,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    headers ? { status, headers } : { status },
  );
}

/** Logs the real error server-side and returns a generic, safe response. */
export function unexpectedError(context: string, error: unknown): NextResponse {
  // A missing credential is an operator problem, not a runtime fault, and
  // burying it under "something went wrong" costs a debugging round trip
  // every time. Report it as 503 with the message naming the variable.
  //
  // Safe to surface: these messages name environment variables, never their
  // values, and are only produced by our own configuration checks.
  if (error instanceof ConfigurationError) {
    console.error(`[${context}] configuration error`, error.message);
    return errorResponse('not_configured', error.message, 503);
  }

  const correlationId = randomUUID();
  console.error(`[${context}] correlation=${correlationId}`, error);
  return errorResponse(
    'internal_error',
    `Something went wrong on our end. Reference: ${correlationId}`,
    500,
  );
}

/** Converts the two {@link AuthError} kinds into the matching HTTP status. */
export function authErrorResponse(error: AuthError): NextResponse {
  if (error.kind === 'unauthenticated') {
    return errorResponse('unauthenticated', error.message, 401);
  }
  return errorResponse('forbidden', error.message, 403);
}

/**
 * Maps a Postgres error surfaced through PostgREST/RPC to an HTTP response.
 *
 * The SECURITY DEFINER RPCs in `0010_rpc.sql` communicate failure modes via
 * SQLSTATE (`errcode`), not ad-hoc strings, so the mapping here is stable:
 *   - 42501 insufficient_privilege -> 401 if unauthenticated, else 403
 *   - P0002 no_data_found          -> 404
 *   - 23514 check_violation        -> 409 (business-rule conflict)
 *   - anything else                -> 500, generic message, logged
 *
 * RPC messages are authored by us (e.g. "insufficient balance: ... required
 * to start") and are safe to show a user; they are never a driver/stack
 * trace, so passing `error.message` through here is deliberate.
 */
export function mapPostgrestError(context: string, error: PostgrestError): NextResponse {
  switch (error.code) {
    case '42501':
      if (error.message.includes('authentication required')) {
        return errorResponse('unauthenticated', 'Sign in to continue', 401);
      }
      return errorResponse('forbidden', error.message, 403);
    case 'P0002':
      return errorResponse('not_found', error.message, 404);
    case '23514':
      return errorResponse('conflict', error.message, 409);
    case '23505':
      return errorResponse('conflict', 'This action was already performed.', 409);
    default:
      return unexpectedError(context, error);
  }
}
