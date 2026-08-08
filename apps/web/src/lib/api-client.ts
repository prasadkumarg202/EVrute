/**
 * Safe JSON reading for API responses.
 *
 * `await response.json()` throws "Unexpected end of JSON input" on an empty
 * body — which is exactly what an unhandled server exception produces. The
 * real error then never reaches the user, and the message they DO see points
 * at JSON parsing, which is never the actual problem.
 *
 * This happened for real: a missing SUPABASE_SERVICE_ROLE_KEY crashed the
 * order route, and the wallet reported "Unexpected end of JSON input".
 * Nothing in that message pointed at the missing environment variable.
 */

export interface ApiErrorShape {
  readonly error?: { readonly code?: string; readonly message?: string } | string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const STATUS_HINTS: Record<number, string> = {
  401: 'Your session expired. Sign in again.',
  403: 'You do not have permission to do that.',
  404: 'That resource no longer exists.',
  409: 'That action conflicts with the current state. Refresh and try again.',
  413: 'That request was too large.',
  429: 'Too many requests. Wait a moment and try again.',
  500: 'The server hit an unexpected error.',
  502: 'The server is unreachable. Try again shortly.',
  503: 'The server is not configured for this yet.',
  504: 'The server took too long to respond.',
};

/**
 * Read a JSON response, or throw an {@link ApiError} carrying something a
 * human can act on. Never throws a parse error.
 */
export async function readJson<T>(response: Response): Promise<T> {
  // Read as text first: a body can only be consumed once, and we need the
  // raw text to produce a useful message when it is not JSON.
  const raw = await response.text().catch(() => '');

  let parsed: unknown = undefined;
  if (raw.trim()) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }
  }

  if (response.ok) {
    if (parsed === undefined) {
      throw new ApiError(
        'The server returned an empty or malformed response.',
        response.status,
      );
    }
    return parsed as T;
  }

  const body = parsed as ApiErrorShape | undefined;
  const fromBody =
    typeof body?.error === 'string'
      ? body.error
      : typeof body?.error === 'object'
        ? body.error?.message
        : undefined;

  const code = typeof body?.error === 'object' ? body.error?.code : undefined;

  const message =
    fromBody ??
    STATUS_HINTS[response.status] ??
    // Last resort: surface a trimmed slice of a non-JSON body (an HTML error
    // page, a proxy message) rather than inventing something reassuring.
    (raw.trim() ? `${response.status}: ${raw.trim().slice(0, 160)}` : `Request failed (${response.status}).`);

  throw new ApiError(message, response.status, code);
}

/** fetch + readJson, with network failures given a readable message too. */
export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    throw new ApiError(
      'Could not reach the server. Check your connection and try again.',
      0,
    );
  }
  return readJson<T>(response);
}

/** JSON POST helper — the shape almost every mutation in the app uses. */
export function apiPost<T>(url: string, body: unknown): Promise<T> {
  return apiFetch<T>(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
