/**
 * In-memory charging provider used for local development, CI and E2E.
 *
 * This is not a mock in the "stub that returns fixtures" sense — it models
 * the real state machine (a session ramps up, meters cumulatively, can be
 * made to fault) so the same tests that exercise the simulator also
 * exercise the code paths that will run against ChargeLab. That means
 * Playwright can drive a full charge without a vendor account, and the
 * webhook handlers get real, ordered events.
 */

import {
  ChargingProviderError,
  type ChargingProvider,
  type ConnectorLiveStatus,
  type DateRange,
  type FaultStatus,
  type FirmwareStatus,
  type MeterValue,
  type ProviderCharger,
  type ProviderConnector,
  type ProviderPricing,
  type ProviderReservationRef,
  type ProviderSessionDetails,
  type ProviderSessionRef,
  type ProviderStation,
  type ProviderWebhookEvent,
  type ReservationWindow,
  type SessionContext,
} from '../provider';

interface SimSession {
  id: string;
  connectorId: string;
  sessionId: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  startedAt: string | null;
  stoppedAt: string | null;
  energyKwh: number;
  powerKw: number;
  meterValues: MeterValue[];
}

export interface SimulatorOptions {
  /** Delivered power in kW; drives how fast energy accrues. */
  readonly powerKw?: number;
  /** Force startCharging to fail — exercises the unwind path. */
  readonly failOnStart?: boolean;
  /** Artificial latency, to make loading states observable in E2E. */
  readonly latencyMs?: number;
  readonly now?: () => number;
}

export class SimulatorChargingProvider implements ChargingProvider {
  readonly name = 'simulator';

  readonly #sessions = new Map<string, SimSession>();
  readonly #connectorStatus = new Map<string, ConnectorLiveStatus>();
  readonly #reservations = new Map<string, ProviderReservationRef>();
  #eventSeq = 0;

  constructor(private readonly options: SimulatorOptions = {}) {}

  #now(): number {
    return (this.options.now ?? Date.now)();
  }

  async #tick(): Promise<void> {
    const ms = this.options.latencyMs ?? 0;
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
  }

  async listStations(): Promise<ProviderStation[]> {
    await this.#tick();
    return [];
  }

  async listChargers(): Promise<ProviderCharger[]> {
    await this.#tick();
    return [];
  }

  async listConnectors(): Promise<ProviderConnector[]> {
    await this.#tick();
    return [];
  }

  async getConnectorStatus(connectorId: string): Promise<ConnectorLiveStatus> {
    await this.#tick();
    return this.#connectorStatus.get(connectorId) ?? 'available';
  }

  async startCharging(connectorId: string, ctx: SessionContext): Promise<ProviderSessionRef> {
    await this.#tick();

    if (this.options.failOnStart) {
      throw new ChargingProviderError('simulated charger did not respond', {
        provider: this.name,
        operation: 'startCharging',
        retryable: false,
      });
    }

    const current = this.#connectorStatus.get(connectorId);
    if (current === 'occupied') {
      throw new ChargingProviderError('connector already in use', {
        provider: this.name,
        operation: 'startCharging',
        retryable: false,
      });
    }

    const providerSessionId = `sim-${ctx.sessionId}`;
    const startedAt = new Date(this.#now()).toISOString();

    this.#sessions.set(providerSessionId, {
      id: providerSessionId,
      connectorId,
      sessionId: ctx.sessionId,
      status: 'active',
      startedAt,
      stoppedAt: null,
      energyKwh: 0,
      powerKw: this.options.powerKw ?? 50,
      meterValues: [],
    });
    this.#connectorStatus.set(connectorId, 'occupied');

    return { providerSessionId, startedAt };
  }

  async stopCharging(ref: ProviderSessionRef): Promise<void> {
    await this.#tick();
    const session = this.#requireSession(ref, 'stopCharging');
    session.status = 'completed';
    session.stoppedAt = new Date(this.#now()).toISOString();
    this.#connectorStatus.set(session.connectorId, 'available');
  }

  async reserveConnector(
    connectorId: string,
    window: ReservationWindow,
  ): Promise<ProviderReservationRef> {
    await this.#tick();
    const ref: ProviderReservationRef = {
      providerReservationId: `sim-res-${connectorId}-${this.#eventSeq++}`,
      expiresAt: window.expiresAt.toISOString(),
    };
    this.#reservations.set(ref.providerReservationId, ref);
    this.#connectorStatus.set(connectorId, 'reserved');
    return ref;
  }

  async cancelReservation(ref: ProviderReservationRef): Promise<void> {
    await this.#tick();
    this.#reservations.delete(ref.providerReservationId);
  }

  async getSessionDetails(ref: ProviderSessionRef): Promise<ProviderSessionDetails> {
    await this.#tick();
    const s = this.#requireSession(ref, 'getSessionDetails');
    return {
      providerSessionId: s.id,
      status: s.status,
      startedAt: s.startedAt,
      stoppedAt: s.stoppedAt,
      energyKwh: s.energyKwh,
    };
  }

  async getMeterValues(ref: ProviderSessionRef): Promise<MeterValue[]> {
    await this.#tick();
    return [...this.#requireSession(ref, 'getMeterValues').meterValues];
  }

  async getChargingHistory(_connectorId: string, _range: DateRange): Promise<ProviderSessionDetails[]> {
    await this.#tick();
    return [];
  }

  async getFirmwareStatus(chargerId: string): Promise<FirmwareStatus> {
    await this.#tick();
    return { chargerId, version: '1.4.2-sim', updateAvailable: false };
  }

  async getFaultStatus(chargerId: string): Promise<FaultStatus> {
    await this.#tick();
    return { chargerId, faulted: false, errorCode: null, message: null };
  }

  async getPricing(): Promise<ProviderPricing> {
    await this.#tick();
    // Pricing is owned by EVRute, not the provider.
    return { pricePerKwh: null, sessionFee: null, currency: 'INR' };
  }

  verifyWebhookSignature(): boolean {
    return true;
  }

  parseWebhookEvent(payload: unknown): ProviderWebhookEvent | null {
    if (typeof payload !== 'object' || payload === null) return null;
    const p = payload as Record<string, unknown>;
    if (typeof p['eventId'] !== 'string' || typeof p['type'] !== 'string') return null;
    return p as unknown as ProviderWebhookEvent;
  }

  // -------------------------------------------------------------------
  // Test controls — advance the simulation deterministically.
  // -------------------------------------------------------------------

  /** Advance a session by `minutes`, emitting one cumulative MeterValue. */
  advance(providerSessionId: string, minutes: number): MeterValue {
    const s = this.#sessions.get(providerSessionId);
    if (!s) throw new Error(`unknown simulated session ${providerSessionId}`);

    s.energyKwh = Number((s.energyKwh + (s.powerKw * minutes) / 60).toFixed(3));
    const value: MeterValue = {
      recordedAt: new Date(this.#now()).toISOString(),
      energyKwh: s.energyKwh,
      powerKw: s.powerKw,
      socPct: Math.min(Math.round(s.energyKwh * 2), 100),
    };
    s.meterValues.push(value);
    return value;
  }

  fault(providerSessionId: string, errorCode = 'GroundFailure'): ProviderWebhookEvent {
    const s = this.#sessions.get(providerSessionId);
    if (!s) throw new Error(`unknown simulated session ${providerSessionId}`);
    s.status = 'failed';
    s.stoppedAt = new Date(this.#now()).toISOString();
    this.#connectorStatus.set(s.connectorId, 'faulted');
    return {
      eventId: `sim-evt-${this.#eventSeq++}`,
      type: 'fault_detected',
      occurredAt: s.stoppedAt,
      providerSessionId,
      errorCode,
      message: 'Simulated fault',
    };
  }

  setConnectorStatus(connectorId: string, status: ConnectorLiveStatus): void {
    this.#connectorStatus.set(connectorId, status);
  }

  reset(): void {
    this.#sessions.clear();
    this.#connectorStatus.clear();
    this.#reservations.clear();
    this.#eventSeq = 0;
  }

  #requireSession(ref: ProviderSessionRef, operation: string): SimSession {
    const s = this.#sessions.get(ref.providerSessionId);
    if (!s) {
      throw new ChargingProviderError(`unknown session ${ref.providerSessionId}`, {
        provider: this.name,
        operation,
        retryable: false,
      });
    }
    return s;
  }
}
