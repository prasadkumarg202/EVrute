import { describe, expect, it, vi } from 'vitest';
import {
  CircuitBreaker,
  CircuitOpenError,
  DEFAULT_RETRY_OPTIONS,
  TimeoutError,
  retry,
  withTimeout,
  type CircuitBreakerOptions,
} from './circuit-breaker';

/** A controllable fake clock: advances only when the test tells it to. */
function fakeClock(start = 0) {
  let now = start;
  return {
    now: () => now,
    advance(ms: number) {
      now += ms;
    },
  };
}

const OPTS: CircuitBreakerOptions = {
  failureThreshold: 3,
  resetTimeoutMs: 10_000,
  successThreshold: 2,
  timeoutMs: 5_000,
};

function ok<T>(value: T): () => Promise<T> {
  return () => Promise.resolve(value);
}

function fail(message = 'boom'): () => Promise<never> {
  return () => Promise.reject(new Error(message));
}

describe('CircuitBreaker', () => {
  it('starts closed and stays closed under the failure threshold', async () => {
    const clock = fakeClock();
    const breaker = new CircuitBreaker('test', OPTS, clock.now);

    await expect(breaker.execute(fail())).rejects.toThrow('boom');
    await expect(breaker.execute(fail())).rejects.toThrow('boom');
    expect(breaker.state).toBe('closed');
  });

  it('opens after N consecutive failures', async () => {
    const clock = fakeClock();
    const breaker = new CircuitBreaker('test', OPTS, clock.now);

    await expect(breaker.execute(fail())).rejects.toThrow();
    await expect(breaker.execute(fail())).rejects.toThrow();
    await expect(breaker.execute(fail())).rejects.toThrow();
    expect(breaker.state).toBe('open');
  });

  it('a success resets the failure counter before the threshold is hit', async () => {
    const clock = fakeClock();
    const breaker = new CircuitBreaker('test', OPTS, clock.now);

    await expect(breaker.execute(fail())).rejects.toThrow();
    await expect(breaker.execute(fail())).rejects.toThrow();
    // Reset the streak.
    await expect(breaker.execute(ok('good'))).resolves.toBe('good');
    expect(breaker.state).toBe('closed');

    // Two more failures should NOT open it — the streak was reset, so this
    // is only 2 consecutive failures, one short of the threshold of 3.
    await expect(breaker.execute(fail())).rejects.toThrow();
    await expect(breaker.execute(fail())).rejects.toThrow();
    expect(breaker.state).toBe('closed');
  });

  it('fails fast with CircuitOpenError when open, and never calls the operation', async () => {
    const clock = fakeClock();
    const breaker = new CircuitBreaker('test', OPTS, clock.now);
    const operation = vi.fn(fail());

    await expect(breaker.execute(operation)).rejects.toThrow();
    await expect(breaker.execute(operation)).rejects.toThrow();
    await expect(breaker.execute(operation)).rejects.toThrow();
    expect(breaker.state).toBe('open');
    operation.mockClear();

    await expect(breaker.execute(operation)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(operation).not.toHaveBeenCalled();
  });

  it('CircuitOpenError carries a sane retryAfterMs', async () => {
    const clock = fakeClock();
    const breaker = new CircuitBreaker('test', OPTS, clock.now);
    for (let i = 0; i < 3; i += 1) await expect(breaker.execute(fail())).rejects.toThrow();

    clock.advance(4_000);
    try {
      await breaker.execute(fail());
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(CircuitOpenError);
      expect((error as CircuitOpenError).retryAfterMs).toBe(6_000);
    }
  });

  it('transitions to half-open after resetTimeoutMs and lets one probe through', async () => {
    const clock = fakeClock();
    const breaker = new CircuitBreaker('test', OPTS, clock.now);
    for (let i = 0; i < 3; i += 1) await expect(breaker.execute(fail())).rejects.toThrow();
    expect(breaker.state).toBe('open');

    clock.advance(9_999);
    expect(breaker.state).toBe('open');

    clock.advance(1);
    expect(breaker.state).toBe('half-open');
  });

  it('half-open needs `successThreshold` successes to close', async () => {
    const clock = fakeClock();
    const breaker = new CircuitBreaker('test', OPTS, clock.now);
    for (let i = 0; i < 3; i += 1) await expect(breaker.execute(fail())).rejects.toThrow();
    clock.advance(10_000);
    expect(breaker.state).toBe('half-open');

    await expect(breaker.execute(ok('probe-1'))).resolves.toBe('probe-1');
    expect(breaker.state).toBe('half-open'); // only 1 of 2 required successes

    await expect(breaker.execute(ok('probe-2'))).resolves.toBe('probe-2');
    expect(breaker.state).toBe('closed');
  });

  it('a failure while half-open re-opens immediately, without needing another N failures', async () => {
    const clock = fakeClock();
    const breaker = new CircuitBreaker('test', OPTS, clock.now);
    for (let i = 0; i < 3; i += 1) await expect(breaker.execute(fail())).rejects.toThrow();
    clock.advance(10_000);
    expect(breaker.state).toBe('half-open');

    // A single failure in half-open — not the 3 required from closed.
    await expect(breaker.execute(fail())).rejects.toThrow();
    expect(breaker.state).toBe('open');
  });

  it('reset() clears state back to closed', async () => {
    const clock = fakeClock();
    const breaker = new CircuitBreaker('test', OPTS, clock.now);
    for (let i = 0; i < 3; i += 1) await expect(breaker.execute(fail())).rejects.toThrow();
    expect(breaker.state).toBe('open');

    breaker.reset();
    expect(breaker.state).toBe('closed');
    await expect(breaker.execute(ok(1))).resolves.toBe(1);
  });
});

describe('withTimeout', () => {
  it('resolves normally when the promise settles before the deadline', async () => {
    vi.useFakeTimers();
    try {
      const p = withTimeout(Promise.resolve('fast'), 1000);
      await vi.advanceTimersByTimeAsync(0);
      await expect(p).resolves.toBe('fast');
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects with TimeoutError when the promise never settles in time', async () => {
    vi.useFakeTimers();
    try {
      const never = new Promise<never>(() => {});
      const p = withTimeout(never, 1000);
      const assertion = expect(p).rejects.toBeInstanceOf(TimeoutError);
      await vi.advanceTimersByTimeAsync(1000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not leak the timer once the promise settles (clearTimeout called)', async () => {
    vi.useFakeTimers();
    try {
      const clearSpy = vi.spyOn(global, 'clearTimeout');
      await withTimeout(Promise.resolve('ok'), 1000);
      await vi.advanceTimersByTimeAsync(0);
      expect(clearSpy).toHaveBeenCalled();
      clearSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('passes the promise straight through when ms <= 0', async () => {
    await expect(withTimeout(Promise.resolve('immediate'), 0)).resolves.toBe('immediate');
  });
});

describe('retry', () => {
  it('returns the result on first success without sleeping', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await retry(ok('done'), {
      ...DEFAULT_RETRY_OPTIONS,
      isRetryable: () => true,
      sleep,
    });
    expect(result).toBe('done');
    expect(sleep).not.toHaveBeenCalled();
  });

  it('stops immediately when isRetryable returns false, without sleeping', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const operation = vi.fn(fail('not retryable'));

    await expect(
      retry(operation, {
        attempts: 5,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        isRetryable: () => false,
        sleep,
      }),
    ).rejects.toThrow('not retryable');

    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries up to `attempts` times and then throws the last error', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const operation = vi.fn(fail('always fails'));

    await expect(
      retry(operation, {
        attempts: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        isRetryable: () => true,
        sleep,
      }),
    ).rejects.toThrow('always fails');

    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2); // no sleep after the last attempt
  });

  it('succeeds after a couple of retries', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    let calls = 0;
    const operation = vi.fn(() => {
      calls += 1;
      if (calls < 3) return Promise.reject(new Error('transient'));
      return Promise.resolve('recovered');
    });

    const result = await retry(operation, {
      attempts: 5,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      isRetryable: () => true,
      sleep,
    });

    expect(result).toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('backs off exponentially with full jitter, capped at maxDelayMs — asserts actual sleep delays', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    // random() = 1 (as close to the ceiling as possible) makes the jitter
    // deterministic and lets us assert exact delay values.
    const random = () => 0.999999999;
    const operation = vi.fn(fail('always fails'));

    await expect(
      retry(operation, {
        attempts: 5,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        isRetryable: () => true,
        sleep,
        random,
      }),
    ).rejects.toThrow();

    // ceilings: 100*2^0=100, 100*2^1=200, 100*2^2=400, 100*2^3=800 (capped
    // at 1000, but 800 < 1000 so unchanged for attempt 4). With random ~1,
    // sleep(ceiling * random) rounds down to just under the ceiling.
    const calls = sleep.mock.calls.map((args) => args[0] as number);
    expect(calls).toHaveLength(4);
    expect(calls[0]).toBe(Math.floor(100 * 0.999999999));
    expect(calls[1]).toBe(Math.floor(200 * 0.999999999));
    expect(calls[2]).toBe(Math.floor(400 * 0.999999999));
    expect(calls[3]).toBe(Math.floor(800 * 0.999999999));
  });

  it('caps the backoff ceiling at maxDelayMs on later attempts', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const random = () => 1; // sample right at the ceiling
    const operation = vi.fn(fail('always fails'));

    await expect(
      retry(operation, {
        attempts: 6,
        baseDelayMs: 100,
        maxDelayMs: 500,
        isRetryable: () => true,
        sleep,
        random,
      }),
    ).rejects.toThrow();

    // Ceilings: 100, 200, 400, 500 (capped from 800), 500 (capped from 1600)
    const calls = sleep.mock.calls.map((args) => args[0] as number);
    expect(calls).toEqual([100, 200, 400, 500, 500]);
  });

  it('uses the default random source only when none is injected (still bounded)', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const operation = vi.fn(fail('fails'));

    await expect(
      retry(operation, {
        attempts: 2,
        baseDelayMs: 50,
        maxDelayMs: 100,
        isRetryable: () => true,
        sleep,
      }),
    ).rejects.toThrow();

    expect(sleep).toHaveBeenCalledTimes(1);
    const delay = sleep.mock.calls[0]![0] as number;
    expect(delay).toBeGreaterThanOrEqual(0);
    expect(delay).toBeLessThan(50);
  });
});
