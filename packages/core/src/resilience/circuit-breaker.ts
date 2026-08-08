/**
 * Retry with exponential backoff + jitter, wrapped in a circuit breaker.
 *
 * The charging provider is a third party on the critical path of every
 * charge. Without a breaker, one slow provider turns into a queue of
 * hanging requests and takes the whole app down with it. The breaker
 * fails fast once a service is clearly unhealthy and probes for recovery
 * instead of hammering it.
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  /** Consecutive failures before the circuit opens. */
  readonly failureThreshold: number;
  /** How long to stay open before allowing one probe request. */
  readonly resetTimeoutMs: number;
  /** Successes required in half-open before closing again. */
  readonly successThreshold: number;
  /** Wall-clock ceiling for a single call. */
  readonly timeoutMs: number;
}

export const DEFAULT_BREAKER_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  successThreshold: 2,
  timeoutMs: 10_000,
};

export class CircuitOpenError extends Error {
  constructor(name: string, readonly retryAfterMs: number) {
    super(`circuit "${name}" is open; retry in ${Math.ceil(retryAfterMs / 1000)}s`);
    this.name = 'CircuitOpenError';
  }
}

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`operation timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export class CircuitBreaker {
  #state: CircuitState = 'closed';
  #failures = 0;
  #successes = 0;
  #openedAt = 0;

  constructor(
    private readonly name: string,
    private readonly options: CircuitBreakerOptions = DEFAULT_BREAKER_OPTIONS,
    private readonly now: () => number = Date.now,
  ) {}

  get state(): CircuitState {
    // Lazily transition open -> half-open so callers do not need a timer.
    if (this.#state === 'open' && this.now() - this.#openedAt >= this.options.resetTimeoutMs) {
      this.#state = 'half-open';
      this.#successes = 0;
    }
    return this.#state;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const state = this.state;

    if (state === 'open') {
      const retryAfter = this.options.resetTimeoutMs - (this.now() - this.#openedAt);
      throw new CircuitOpenError(this.name, Math.max(retryAfter, 0));
    }

    try {
      const result = await withTimeout(operation(), this.options.timeoutMs);
      this.#onSuccess();
      return result;
    } catch (error) {
      this.#onFailure();
      throw error;
    }
  }

  #onSuccess(): void {
    if (this.#state === 'half-open') {
      this.#successes += 1;
      if (this.#successes >= this.options.successThreshold) {
        this.#state = 'closed';
        this.#failures = 0;
        this.#successes = 0;
      }
      return;
    }
    this.#failures = 0;
  }

  #onFailure(): void {
    // A failure during the half-open probe re-opens immediately: the
    // service has not recovered and does not deserve more traffic.
    if (this.#state === 'half-open') {
      this.#trip();
      return;
    }
    this.#failures += 1;
    if (this.#failures >= this.options.failureThreshold) {
      this.#trip();
    }
  }

  #trip(): void {
    this.#state = 'open';
    this.#openedAt = this.now();
    this.#successes = 0;
  }

  /** Test seam. */
  reset(): void {
    this.#state = 'closed';
    this.#failures = 0;
    this.#successes = 0;
    this.#openedAt = 0;
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  if (ms <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export interface RetryOptions {
  readonly attempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly isRetryable: (error: unknown) => boolean;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
}

export const DEFAULT_RETRY_OPTIONS: Omit<RetryOptions, 'isRetryable'> = {
  attempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 4_000,
};

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function retry<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      const isLast = attempt === options.attempts;
      if (isLast || !options.isRetryable(error)) break;

      // Full jitter: exponential ceiling, uniform sample below it. Prevents
      // a fleet of clients retrying in lockstep after a provider blip.
      const ceiling = Math.min(options.baseDelayMs * 2 ** (attempt - 1), options.maxDelayMs);
      await sleep(Math.floor(random() * ceiling));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
