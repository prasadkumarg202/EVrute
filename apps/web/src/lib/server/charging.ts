import 'server-only';

import {
  createChargingProviderService,
  type ChargingProviderService,
} from '@evrute/core/server';
import { isProduction, serverEnv } from '@/lib/env';

/**
 * Composition root for the charging provider on the server.
 *
 * Memoised per server instance (module-level singleton) so every route
 * handler and webhook reuses one circuit breaker instead of each request
 * building its own — the breaker's whole point is to remember failures
 * across calls.
 *
 * `CHARGING_PROVIDER=simulator` in dev/CI, `chargelab` in production. A
 * production deploy missing ChargeLab credentials fails loudly here rather
 * than silently falling back to the simulator and reporting phantom
 * charging sessions.
 */

let cached: ChargingProviderService | null = null;

export function getChargingProvider(): ChargingProviderService {
  if (cached) return cached;

  const env = serverEnv();

  if (isProduction && env.CHARGING_PROVIDER === 'simulator') {
    throw new Error(
      'CHARGING_PROVIDER=simulator is not permitted in production. ' +
        'Set CHARGING_PROVIDER=chargelab and the matching credentials.',
    );
  }

  if (env.CHARGING_PROVIDER === 'chargelab') {
    const { CHARGING_PROVIDER_BASE_URL, CHARGING_PROVIDER_API_KEY, CHARGING_PROVIDER_WEBHOOK_SECRET } = env;
    if (!CHARGING_PROVIDER_BASE_URL || !CHARGING_PROVIDER_API_KEY || !CHARGING_PROVIDER_WEBHOOK_SECRET) {
      throw new Error(
        'CHARGING_PROVIDER=chargelab requires CHARGING_PROVIDER_BASE_URL, ' +
          'CHARGING_PROVIDER_API_KEY and CHARGING_PROVIDER_WEBHOOK_SECRET to be set.',
      );
    }
    cached = createChargingProviderService({
      kind: 'chargelab',
      chargelab: {
        baseUrl: CHARGING_PROVIDER_BASE_URL,
        apiKey: CHARGING_PROVIDER_API_KEY,
        webhookSecret: CHARGING_PROVIDER_WEBHOOK_SECRET,
      },
    });
    return cached;
  }

  // 'simulator' (dev/test) and 'edrv' (createChargingProviderService throws
  // a clear "not implemented yet" error for edrv itself) both fall through
  // to the generic composition root.
  cached = createChargingProviderService({ kind: env.CHARGING_PROVIDER });
  return cached;
}
