/**
 * The charging-provider boundary.
 *
 * EVRute never speaks OCPP and never opens a WebSocket to a charger. All
 * charger communication goes through a headless OCPP provider (ChargeLab,
 * eDRV) over REST + webhooks. Everything vendor-specific lives behind this
 * interface, so replacing the vendor — or eventually running our own OCPP
 * server — means writing one new adapter and changing one environment
 * variable. No call site changes.
 *
 * Ported from the handoff spec's NestJS `ChargingProvider` contract.
 */

export type ConnectorLiveStatus =
  | 'available'
  | 'occupied'
  | 'reserved'
  | 'offline'
  | 'faulted';

export type ProviderSessionRef = {
  readonly providerSessionId: string;
  readonly startedAt?: string;
};

export type ProviderReservationRef = {
  readonly providerReservationId: string;
  readonly expiresAt: string;
};

export interface SessionContext {
  /** EVRute session id — round-tripped so webhooks can be correlated. */
  readonly sessionId: string;
  readonly userId: string;
  readonly connectorId: string;
  /** Upper bound the charger should self-stop at, in kWh. */
  readonly energyLimitKwh?: number;
  readonly idTag?: string;
}

export interface ProviderStation {
  readonly id: string;
  readonly name: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly address: string | null;
}

export interface ProviderCharger {
  readonly id: string;
  readonly stationId: string;
  readonly label: string;
  readonly vendor: string | null;
  readonly model: string | null;
  readonly powerKw: number;
  readonly ocppVersion: '1.6J' | '2.0.1';
  readonly firmwareVersion: string | null;
  readonly online: boolean;
}

export interface ProviderConnector {
  readonly id: string;
  readonly chargerId: string;
  readonly connectorNumber: number;
  readonly type: string;
  readonly currentType: 'AC' | 'DC';
  readonly powerKw: number;
  readonly status: ConnectorLiveStatus;
}

export interface MeterValue {
  readonly recordedAt: string;
  readonly energyKwh: number;
  readonly powerKw?: number;
  readonly voltage?: number;
  readonly currentA?: number;
  readonly socPct?: number;
}

export interface ProviderSessionDetails {
  readonly providerSessionId: string;
  readonly status: 'pending' | 'active' | 'completed' | 'failed';
  readonly startedAt: string | null;
  readonly stoppedAt: string | null;
  readonly energyKwh: number;
  readonly stopReason?: string;
}

export interface ReservationWindow {
  readonly startsAt: Date;
  readonly expiresAt: Date;
}

export interface DateRange {
  readonly from: Date;
  readonly to: Date;
}

export interface FirmwareStatus {
  readonly chargerId: string;
  readonly version: string | null;
  readonly updateAvailable: boolean;
}

export interface FaultStatus {
  readonly chargerId: string;
  readonly faulted: boolean;
  readonly errorCode: string | null;
  readonly message: string | null;
}

export interface ProviderPricing {
  readonly pricePerKwh: number | null;
  readonly sessionFee: number | null;
  readonly currency: string;
}

/**
 * Every method may throw {@link ChargingProviderError}. Adapters must never
 * leak vendor-shaped errors or DTOs past this boundary.
 */
export interface ChargingProvider {
  readonly name: string;

  listStations(): Promise<ProviderStation[]>;
  listChargers(stationId: string): Promise<ProviderCharger[]>;
  listConnectors(chargerId: string): Promise<ProviderConnector[]>;

  getConnectorStatus(connectorId: string): Promise<ConnectorLiveStatus>;

  startCharging(connectorId: string, ctx: SessionContext): Promise<ProviderSessionRef>;
  stopCharging(ref: ProviderSessionRef): Promise<void>;

  reserveConnector(connectorId: string, window: ReservationWindow): Promise<ProviderReservationRef>;
  cancelReservation(ref: ProviderReservationRef): Promise<void>;

  getSessionDetails(ref: ProviderSessionRef): Promise<ProviderSessionDetails>;
  getMeterValues(ref: ProviderSessionRef): Promise<MeterValue[]>;
  getChargingHistory(connectorId: string, range: DateRange): Promise<ProviderSessionDetails[]>;

  getFirmwareStatus(chargerId: string): Promise<FirmwareStatus>;
  getFaultStatus(chargerId: string): Promise<FaultStatus>;
  getPricing(connectorId: string): Promise<ProviderPricing>;

  /**
   * Verify a webhook signature. Implemented per-vendor because the header
   * name, algorithm and canonical payload all differ.
   */
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean;

  /** Normalise a vendor webhook body into an internal event. */
  parseWebhookEvent(payload: unknown): ProviderWebhookEvent | null;
}

export type ProviderWebhookEventType =
  | 'charging_started'
  | 'charging_stopped'
  | 'charging_failed'
  | 'meter_values'
  | 'connector_online'
  | 'connector_offline'
  | 'fault_detected'
  | 'reservation_expired'
  | 'firmware_updated'
  | 'payment_required';

export interface ProviderWebhookEvent {
  /** Vendor event id — the dedupe key for webhook_events. */
  readonly eventId: string;
  readonly type: ProviderWebhookEventType;
  readonly occurredAt: string;
  readonly providerSessionId?: string;
  readonly providerConnectorId?: string;
  readonly providerChargerId?: string;
  readonly meterValue?: MeterValue;
  readonly errorCode?: string;
  readonly message?: string;
}

export class ChargingProviderError extends Error {
  constructor(
    message: string,
    readonly options: {
      readonly provider: string;
      readonly operation: string;
      readonly status?: number;
      readonly retryable: boolean;
      readonly cause?: unknown;
    },
  ) {
    super(message);
    this.name = 'ChargingProviderError';
  }
}
