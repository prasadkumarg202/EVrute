/**
 * ChargeLab adapter.
 *
 * The single place in the codebase allowed to know ChargeLab's REST shape.
 * Every response is translated into EVRute's own domain types before it
 * leaves this file, and every error becomes a ChargingProviderError with an
 * explicit `retryable` flag so the resilience layer can make a correct
 * decision instead of guessing from a status code at the call site.
 *
 * Swapping to eDRV means writing a sibling file that implements the same
 * interface — nothing above this layer changes.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
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
  type ProviderWebhookEventType,
  type ReservationWindow,
  type SessionContext,
} from '../provider';

export interface ChargeLabConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly webhookSecret: string;
  readonly fetchImpl?: typeof fetch;
}

/** 408/429 and 5xx are transient; 4xx otherwise means we sent something wrong. */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const STATUS_MAP: Record<string, ConnectorLiveStatus> = {
  AVAILABLE: 'available',
  PREPARING: 'occupied',
  CHARGING: 'occupied',
  SUSPENDED_EV: 'occupied',
  SUSPENDED_EVSE: 'occupied',
  FINISHING: 'occupied',
  RESERVED: 'reserved',
  UNAVAILABLE: 'offline',
  OFFLINE: 'offline',
  FAULTED: 'faulted',
};

const EVENT_MAP: Record<string, ProviderWebhookEventType> = {
  'charging.started': 'charging_started',
  'charging.stopped': 'charging_stopped',
  'charging.failed': 'charging_failed',
  'meter.values': 'meter_values',
  'connector.online': 'connector_online',
  'connector.offline': 'connector_offline',
  'charger.fault': 'fault_detected',
  'reservation.expired': 'reservation_expired',
  'firmware.updated': 'firmware_updated',
  'payment.required': 'payment_required',
};

export class ChargeLabAdapter implements ChargingProvider {
  readonly name = 'chargelab';
  readonly #fetch: typeof fetch;

  constructor(private readonly config: ChargeLabConfig) {
    if (!config.baseUrl) throw new Error('ChargeLabAdapter requires baseUrl');
    if (!config.apiKey) throw new Error('ChargeLabAdapter requires apiKey');
    this.#fetch = config.fetchImpl ?? fetch;
  }

  async #request<T>(
    operation: string,
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}${path}`;
    let response: Response;

    try {
      response = await this.#fetch(url, {
        ...init,
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          'content-type': 'application/json',
          accept: 'application/json',
          ...init.headers,
        },
      });
    } catch (cause) {
      // Network-level failure: no response at all, always worth a retry.
      throw new ChargingProviderError(`network error calling ${operation}`, {
        provider: this.name,
        operation,
        retryable: true,
        cause,
      });
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ChargingProviderError(
        `${operation} failed with ${response.status}: ${body.slice(0, 300)}`,
        {
          provider: this.name,
          operation,
          status: response.status,
          retryable: RETRYABLE_STATUS.has(response.status),
        },
      );
    }

    if (response.status === 204) return undefined as T;

    try {
      return (await response.json()) as T;
    } catch (cause) {
      throw new ChargingProviderError(`${operation} returned malformed JSON`, {
        provider: this.name,
        operation,
        retryable: false,
        cause,
      });
    }
  }

  async listStations(): Promise<ProviderStation[]> {
    const data = await this.#request<{ data: RawStation[] }>('listStations', '/v1/sites');
    return (data.data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      latitude: s.latitude ?? null,
      longitude: s.longitude ?? null,
      address: s.address ?? null,
    }));
  }

  async listChargers(stationId: string): Promise<ProviderCharger[]> {
    const data = await this.#request<{ data: RawCharger[] }>(
      'listChargers',
      `/v1/sites/${encodeURIComponent(stationId)}/chargers`,
    );
    return (data.data ?? []).map((c) => ({
      id: c.id,
      stationId,
      label: c.name ?? c.id,
      vendor: c.vendor ?? null,
      model: c.model ?? null,
      powerKw: c.maxPowerKw ?? 0,
      ocppVersion: c.ocppVersion === '2.0.1' ? '2.0.1' : '1.6J',
      firmwareVersion: c.firmwareVersion ?? null,
      online: c.connectionStatus === 'ONLINE',
    }));
  }

  async listConnectors(chargerId: string): Promise<ProviderConnector[]> {
    const data = await this.#request<{ data: RawConnector[] }>(
      'listConnectors',
      `/v1/chargers/${encodeURIComponent(chargerId)}/connectors`,
    );
    return (data.data ?? []).map((c) => ({
      id: c.id,
      chargerId,
      connectorNumber: c.connectorId ?? 1,
      type: c.connectorType ?? 'UNKNOWN',
      currentType: c.currentType === 'AC' ? 'AC' : 'DC',
      powerKw: c.maxPowerKw ?? 0,
      status: STATUS_MAP[c.status ?? ''] ?? 'offline',
    }));
  }

  async getConnectorStatus(connectorId: string): Promise<ConnectorLiveStatus> {
    const data = await this.#request<RawConnector>(
      'getConnectorStatus',
      `/v1/connectors/${encodeURIComponent(connectorId)}`,
    );
    return STATUS_MAP[data.status ?? ''] ?? 'offline';
  }

  async startCharging(connectorId: string, ctx: SessionContext): Promise<ProviderSessionRef> {
    const data = await this.#request<RawSession>('startCharging', '/v1/transactions', {
      method: 'POST',
      headers: {
        // ChargeLab honours this for at-most-once RemoteStartTransaction —
        // without it a retried request can start two physical charges.
        'idempotency-key': ctx.sessionId,
      },
      body: JSON.stringify({
        connectorId,
        externalReference: ctx.sessionId,
        idTag: ctx.idTag ?? ctx.userId,
        ...(ctx.energyLimitKwh !== undefined ? { energyLimitKwh: ctx.energyLimitKwh } : {}),
      }),
    });

    return {
      providerSessionId: data.id,
      ...(data.startedAt ? { startedAt: data.startedAt } : {}),
    };
  }

  async stopCharging(ref: ProviderSessionRef): Promise<void> {
    await this.#request<void>(
      'stopCharging',
      `/v1/transactions/${encodeURIComponent(ref.providerSessionId)}/stop`,
      { method: 'POST', headers: { 'idempotency-key': `stop-${ref.providerSessionId}` } },
    );
  }

  async reserveConnector(
    connectorId: string,
    window: ReservationWindow,
  ): Promise<ProviderReservationRef> {
    const data = await this.#request<RawReservation>('reserveConnector', '/v1/reservations', {
      method: 'POST',
      body: JSON.stringify({
        connectorId,
        startsAt: window.startsAt.toISOString(),
        expiresAt: window.expiresAt.toISOString(),
      }),
    });
    return {
      providerReservationId: data.id,
      expiresAt: data.expiresAt ?? window.expiresAt.toISOString(),
    };
  }

  async cancelReservation(ref: ProviderReservationRef): Promise<void> {
    await this.#request<void>(
      'cancelReservation',
      `/v1/reservations/${encodeURIComponent(ref.providerReservationId)}`,
      { method: 'DELETE' },
    );
  }

  async getSessionDetails(ref: ProviderSessionRef): Promise<ProviderSessionDetails> {
    const data = await this.#request<RawSession>(
      'getSessionDetails',
      `/v1/transactions/${encodeURIComponent(ref.providerSessionId)}`,
    );
    return {
      providerSessionId: data.id,
      status:
        data.state === 'COMPLETED'
          ? 'completed'
          : data.state === 'FAILED'
            ? 'failed'
            : data.startedAt
              ? 'active'
              : 'pending',
      startedAt: data.startedAt ?? null,
      stoppedAt: data.stoppedAt ?? null,
      energyKwh: data.energyDeliveredKwh ?? 0,
      ...(data.stopReason ? { stopReason: data.stopReason } : {}),
    };
  }

  async getMeterValues(ref: ProviderSessionRef): Promise<MeterValue[]> {
    const data = await this.#request<{ data: RawMeterValue[] }>(
      'getMeterValues',
      `/v1/transactions/${encodeURIComponent(ref.providerSessionId)}/meter-values`,
    );
    return (data.data ?? []).map(toMeterValue);
  }

  async getChargingHistory(
    connectorId: string,
    range: DateRange,
  ): Promise<ProviderSessionDetails[]> {
    const params = new URLSearchParams({
      connectorId,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    });
    const data = await this.#request<{ data: RawSession[] }>(
      'getChargingHistory',
      `/v1/transactions?${params.toString()}`,
    );
    return (data.data ?? []).map((s) => ({
      providerSessionId: s.id,
      status: s.state === 'COMPLETED' ? 'completed' : s.state === 'FAILED' ? 'failed' : 'active',
      startedAt: s.startedAt ?? null,
      stoppedAt: s.stoppedAt ?? null,
      energyKwh: s.energyDeliveredKwh ?? 0,
    }));
  }

  async getFirmwareStatus(chargerId: string): Promise<FirmwareStatus> {
    const data = await this.#request<RawCharger>(
      'getFirmwareStatus',
      `/v1/chargers/${encodeURIComponent(chargerId)}`,
    );
    return {
      chargerId,
      version: data.firmwareVersion ?? null,
      updateAvailable: data.firmwareUpdateAvailable === true,
    };
  }

  async getFaultStatus(chargerId: string): Promise<FaultStatus> {
    const data = await this.#request<RawCharger>(
      'getFaultStatus',
      `/v1/chargers/${encodeURIComponent(chargerId)}`,
    );
    return {
      chargerId,
      faulted: data.connectionStatus === 'FAULTED',
      errorCode: data.errorCode ?? null,
      message: data.errorMessage ?? null,
    };
  }

  async getPricing(): Promise<ProviderPricing> {
    // Tariffs are EVRute's, not the provider's. Returning nulls keeps the
    // interface honest rather than inventing a number.
    return { pricePerKwh: null, sessionFee: null, currency: 'INR' };
  }

  /**
   * HMAC-SHA256 over the raw body. Compared with `timingSafeEqual` — a
   * plain `===` leaks the signature one byte at a time under timing
   * analysis, which is enough to forge a webhook.
   */
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
    if (!signature || !this.config.webhookSecret) return false;

    const expected = createHmac('sha256', this.config.webhookSecret)
      .update(rawBody, 'utf8')
      .digest('hex');

    const received = signature.startsWith('sha256=') ? signature.slice(7) : signature;
    if (received.length !== expected.length) return false;

    try {
      return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
    } catch {
      return false;
    }
  }

  parseWebhookEvent(payload: unknown): ProviderWebhookEvent | null {
    if (typeof payload !== 'object' || payload === null) return null;
    const p = payload as RawWebhook;

    const type = EVENT_MAP[p.type ?? ''];
    if (!type || typeof p.id !== 'string') return null;

    const data = p.data ?? {};
    return {
      eventId: p.id,
      type,
      occurredAt: p.occurredAt ?? new Date().toISOString(),
      ...(data.transactionId ? { providerSessionId: data.transactionId } : {}),
      ...(data.connectorId ? { providerConnectorId: data.connectorId } : {}),
      ...(data.chargerId ? { providerChargerId: data.chargerId } : {}),
      ...(data.meterValue ? { meterValue: toMeterValue(data.meterValue) } : {}),
      ...(data.errorCode ? { errorCode: data.errorCode } : {}),
      ...(data.message ? { message: data.message } : {}),
    };
  }
}

function toMeterValue(m: RawMeterValue): MeterValue {
  return {
    recordedAt: m.timestamp ?? new Date().toISOString(),
    energyKwh: m.energyKwh ?? 0,
    ...(m.powerKw !== undefined ? { powerKw: m.powerKw } : {}),
    ...(m.voltage !== undefined ? { voltage: m.voltage } : {}),
    ...(m.current !== undefined ? { currentA: m.current } : {}),
    ...(m.stateOfCharge !== undefined ? { socPct: m.stateOfCharge } : {}),
  };
}

// -- Vendor wire shapes. Intentionally loose: we validate by mapping, and a
// -- new field appearing upstream must never crash a webhook handler.
interface RawStation { id: string; name: string; latitude?: number; longitude?: number; address?: string }
interface RawCharger {
  id: string; name?: string; vendor?: string; model?: string; maxPowerKw?: number;
  ocppVersion?: string; firmwareVersion?: string; firmwareUpdateAvailable?: boolean;
  connectionStatus?: string; errorCode?: string; errorMessage?: string;
}
interface RawConnector {
  id: string; connectorId?: number; connectorType?: string; currentType?: string;
  maxPowerKw?: number; status?: string;
}
interface RawSession {
  id: string; state?: string; startedAt?: string; stoppedAt?: string;
  energyDeliveredKwh?: number; stopReason?: string;
}
interface RawReservation { id: string; expiresAt?: string }
interface RawMeterValue {
  timestamp?: string; energyKwh?: number; powerKw?: number; voltage?: number;
  current?: number; stateOfCharge?: number;
}
interface RawWebhook {
  id?: string; type?: string; occurredAt?: string;
  data?: {
    transactionId?: string; connectorId?: string; chargerId?: string;
    meterValue?: RawMeterValue; errorCode?: string; message?: string;
  };
}
