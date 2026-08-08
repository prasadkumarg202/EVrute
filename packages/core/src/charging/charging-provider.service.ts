/**
 * ChargingProviderService — the only thing application code talks to.
 *
 * Wraps the configured adapter with retries, a circuit breaker and
 * structured logging. Nothing outside this file constructs an adapter, so
 * changing vendor is a one-line config change and swapping to an in-house
 * OCPP server later is a new adapter plus one line here.
 */

import {
  CircuitBreaker,
  DEFAULT_RETRY_OPTIONS,
  retry,
  type CircuitBreakerOptions,
} from '../resilience/circuit-breaker';
import {
  ChargingProviderError,
  type ChargingProvider,
  type ConnectorLiveStatus,
  type MeterValue,
  type ProviderReservationRef,
  type ProviderSessionDetails,
  type ProviderSessionRef,
  type ReservationWindow,
  type SessionContext,
} from './provider';
import { ChargeLabAdapter, type ChargeLabConfig } from './adapters/chargelab.adapter';
import { SimulatorChargingProvider, type SimulatorOptions } from './adapters/simulator.adapter';

export type ProviderKind = 'chargelab' | 'edrv' | 'simulator';

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export interface ChargingProviderServiceOptions {
  readonly logger?: Logger;
  readonly breaker?: Partial<CircuitBreakerOptions>;
  readonly retryAttempts?: number;
}

function isRetryable(error: unknown): boolean {
  // Only retry what the adapter explicitly marked retryable. Retrying a
  // 400 wastes a round trip; retrying a start-charge could double-charge
  // if the provider did not honour the idempotency key.
  return error instanceof ChargingProviderError && error.options.retryable;
}

export class ChargingProviderService {
  readonly #breaker: CircuitBreaker;
  readonly #logger: Logger;
  readonly #attempts: number;

  constructor(
    private readonly adapter: ChargingProvider,
    options: ChargingProviderServiceOptions = {},
  ) {
    this.#logger = options.logger ?? noopLogger;
    this.#attempts = options.retryAttempts ?? DEFAULT_RETRY_OPTIONS.attempts;
    this.#breaker = new CircuitBreaker(`charging:${adapter.name}`, {
      failureThreshold: options.breaker?.failureThreshold ?? 5,
      resetTimeoutMs: options.breaker?.resetTimeoutMs ?? 30_000,
      successThreshold: options.breaker?.successThreshold ?? 2,
      timeoutMs: options.breaker?.timeoutMs ?? 10_000,
    });
  }

  get providerName(): string {
    return this.adapter.name;
  }

  get circuitState(): string {
    return this.#breaker.state;
  }

  async #call<T>(operation: string, fn: () => Promise<T>, meta: Record<string, unknown> = {}): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await retry(() => this.#breaker.execute(fn), {
        ...DEFAULT_RETRY_OPTIONS,
        attempts: this.#attempts,
        isRetryable,
      });
      this.#logger.debug('charging provider call ok', {
        provider: this.adapter.name,
        operation,
        durationMs: Date.now() - startedAt,
        ...meta,
      });
      return result;
    } catch (error) {
      this.#logger.error('charging provider call failed', {
        provider: this.adapter.name,
        operation,
        durationMs: Date.now() - startedAt,
        circuit: this.#breaker.state,
        error: error instanceof Error ? error.message : String(error),
        ...meta,
      });
      throw error;
    }
  }

  startCharging(connectorId: string, ctx: SessionContext): Promise<ProviderSessionRef> {
    return this.#call('startCharging', () => this.adapter.startCharging(connectorId, ctx), {
      connectorId,
      sessionId: ctx.sessionId,
    });
  }

  stopCharging(ref: ProviderSessionRef): Promise<void> {
    return this.#call('stopCharging', () => this.adapter.stopCharging(ref), {
      providerSessionId: ref.providerSessionId,
    });
  }

  getConnectorStatus(connectorId: string): Promise<ConnectorLiveStatus> {
    return this.#call('getConnectorStatus', () => this.adapter.getConnectorStatus(connectorId), {
      connectorId,
    });
  }

  getSessionDetails(ref: ProviderSessionRef): Promise<ProviderSessionDetails> {
    return this.#call('getSessionDetails', () => this.adapter.getSessionDetails(ref));
  }

  getMeterValues(ref: ProviderSessionRef): Promise<MeterValue[]> {
    return this.#call('getMeterValues', () => this.adapter.getMeterValues(ref));
  }

  reserveConnector(connectorId: string, window: ReservationWindow): Promise<ProviderReservationRef> {
    return this.#call('reserveConnector', () => this.adapter.reserveConnector(connectorId, window), {
      connectorId,
    });
  }

  cancelReservation(ref: ProviderReservationRef): Promise<void> {
    return this.#call('cancelReservation', () => this.adapter.cancelReservation(ref));
  }

  // Signature verification and parsing are pure and local — no network, so
  // no retry or breaker. They must stay synchronous so a webhook route can
  // reject a forged request before doing anything else.
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
    return this.adapter.verifyWebhookSignature(rawBody, signature);
  }

  parseWebhookEvent(payload: unknown) {
    return this.adapter.parseWebhookEvent(payload);
  }
}

export interface CreateProviderConfig {
  readonly kind: ProviderKind;
  readonly chargelab?: ChargeLabConfig;
  readonly simulator?: SimulatorOptions;
  readonly service?: ChargingProviderServiceOptions;
}

/**
 * Single composition root. `CHARGING_PROVIDER=simulator` in dev/CI,
 * `chargelab` in production.
 */
export function createChargingProviderService(
  config: CreateProviderConfig,
): ChargingProviderService {
  switch (config.kind) {
    case 'chargelab': {
      if (!config.chargelab) {
        throw new Error('CHARGING_PROVIDER=chargelab requires ChargeLab credentials');
      }
      return new ChargingProviderService(new ChargeLabAdapter(config.chargelab), config.service);
    }
    case 'edrv':
      // Deliberate: fail loudly rather than silently falling back to a
      // simulator in production and reporting phantom charging sessions.
      throw new Error(
        'eDRV adapter is not implemented yet. Implement ChargingProvider in ' +
          'adapters/edrv.adapter.ts and register it here.',
      );
    case 'simulator':
      return new ChargingProviderService(
        new SimulatorChargingProvider(config.simulator ?? {}),
        config.service,
      );
    default: {
      const exhaustive: never = config.kind;
      throw new Error(`unknown charging provider: ${String(exhaustive)}`);
    }
  }
}
