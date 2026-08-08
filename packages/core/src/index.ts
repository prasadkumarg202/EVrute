/**
 * Client-safe surface of @evrute/core.
 *
 * Everything exported here is pure TypeScript with no Node built-ins, so it
 * is safe to import from a Client Component. The provider adapters use
 * `node:crypto` for signature verification and live behind `@evrute/core/server`
 * — importing them from the browser bundle is a build error rather than a
 * silent 300 KB of crypto shim.
 *
 * Types are re-exported here too: `import type` is erased at compile time,
 * so a component can be typed against a provider contract without pulling
 * the implementation.
 */

export * from './money/pricing';
export * from './domain/status';
export * from './resilience/circuit-breaker';

export type {
  ChargingProvider,
  ConnectorLiveStatus,
  DateRange,
  FaultStatus,
  FirmwareStatus,
  MeterValue,
  ProviderCharger,
  ProviderConnector,
  ProviderPricing,
  ProviderReservationRef,
  ProviderSessionDetails,
  ProviderSessionRef,
  ProviderStation,
  ProviderWebhookEvent,
  ProviderWebhookEventType,
  ReservationWindow,
  SessionContext,
} from './charging/provider';

export type {
  CreateOrderInput,
  PaymentEvent,
  PaymentEventType,
  PaymentProvider,
  PaymentProviderKind,
  ProviderOrder,
  RefundResult,
} from './payments/payment-provider';
