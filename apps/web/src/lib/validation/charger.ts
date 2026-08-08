import { z } from 'zod';

/** Mirrors `public.chargers` / `public.connectors` check constraints in `0003_assets.sql`. */

export const OCPP_VERSIONS = ['1.6J', '2.0.1'] as const;

export const chargerSchema = z.object({
  label: z.string().trim().min(1, 'Label is required').max(60, 'Keep it under 60 characters'),
  vendor: z.string().trim().max(80).optional().or(z.literal('')),
  model: z.string().trim().max(80).optional().or(z.literal('')),
  powerKw: z.coerce.number().gt(0, 'Power must be greater than 0').max(1000, 'Power must be at most 1000 kW'),
  ocppVersion: z.enum(OCPP_VERSIONS),
});

export type ChargerFormValues = z.infer<typeof chargerSchema>;

export const CONNECTOR_TYPES = ['CCS2', 'TYPE2', 'GBT', 'CHADEMO', 'AC_3PIN'] as const;
export const CURRENT_TYPES = ['AC', 'DC'] as const;
/** Statuses an owner may set by hand — the live states (`occupied`, `reserved`) come from OCPP telemetry only. */
export const OWNER_SETTABLE_CONNECTOR_STATUS = ['available', 'offline', 'faulted'] as const;

export const connectorSchema = z.object({
  connectorNumber: z.coerce.number().int('Must be a whole number').positive('Must be a positive number'),
  type: z.enum(CONNECTOR_TYPES),
  currentType: z.enum(CURRENT_TYPES),
  powerKw: z.coerce.number().gt(0, 'Power must be greater than 0').max(1000, 'Power must be at most 1000 kW'),
  status: z.enum(OWNER_SETTABLE_CONNECTOR_STATUS),
});

export type ConnectorFormValues = z.infer<typeof connectorSchema>;
