import { z } from 'zod';
import { CONNECTOR_TYPES } from './charger';

/** Mirrors `public.tariffs` check constraints in `0003_assets.sql`. */

export const tariffSchema = z.object({
  connectorType: z.union([z.enum(CONNECTOR_TYPES), z.literal('')]).default(''),
  pricePerKwh: z.coerce.number().min(0, 'Must be 0 or more').max(1000, 'Must be at most ₹1000'),
  sessionFee: z.coerce.number().min(0, 'Must be 0 or more').default(0),
  idleFeePerMin: z.coerce.number().min(0, 'Must be 0 or more').default(0),
  minBalanceToStart: z.coerce.number().min(0, 'Must be 0 or more').default(100),
  taxPct: z.coerce.number().min(0, 'Must be 0 or more').max(100, 'Must be at most 100%').default(18),
  effectiveFrom: z.string().min(1, 'Choose when this price starts applying'),
});

export type TariffFormValues = z.infer<typeof tariffSchema>;
