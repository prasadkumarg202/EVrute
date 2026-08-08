import { z } from 'zod';

/**
 * Environment validation.
 *
 * Fails at boot with a readable message rather than at 2am with
 * `undefined is not a function` inside a webhook handler. Server-only
 * secrets are validated lazily so the client bundle never touches them.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, 'NEXT_PUBLIC_SUPABASE_ANON_KEY looks wrong'),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_MAP_TILE_URL: z
    .string()
    .default('https://tile.openstreetmap.org/{z}/{x}/{y}.png'),
  NEXT_PUBLIC_RAZORPAY_KEY_ID: z.string().optional(),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  CHARGING_PROVIDER: z.enum(['chargelab', 'edrv', 'simulator']).default('simulator'),
  CHARGING_PROVIDER_BASE_URL: z.string().url().optional(),
  CHARGING_PROVIDER_API_KEY: z.string().optional(),
  CHARGING_PROVIDER_WEBHOOK_SECRET: z.string().optional(),
  PAYMENT_PROVIDER: z.enum(['razorpay', 'cashfree']).default('razorpay'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  PLATFORM_GST_PCT: z.coerce.number().min(0).max(100).default(18),
  PLATFORM_TDS_PCT: z.coerce.number().min(0).max(100).default(1),
});

// Next.js inlines NEXT_PUBLIC_* only when referenced statically, so these
// cannot be read from a dynamic object at build time.
const publicParsed = publicSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_MAP_TILE_URL: process.env.NEXT_PUBLIC_MAP_TILE_URL,
  NEXT_PUBLIC_RAZORPAY_KEY_ID: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
});

if (!publicParsed.success) {
  const issues = publicParsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  throw new Error(
    `Invalid public environment configuration:\n${issues.join('\n')}\n\n` +
      'Copy .env.example to .env.local and fill in the Supabase values.',
  );
}

export const env = publicParsed.data;

let serverCache: z.infer<typeof serverSchema> | null = null;

/** Server-only config. Throws if called from the browser bundle. */
export function serverEnv(): z.infer<typeof serverSchema> {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() must never be called from client code');
  }
  if (serverCache) return serverCache;

  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid server environment configuration:\n${issues.join('\n')}`);
  }
  serverCache = parsed.data;
  return serverCache;
}

export const isProduction = process.env.NODE_ENV === 'production';

/**
 * A required credential or setting is absent.
 *
 * Distinct from a runtime failure: the message is safe to show an operator
 * and names the variable, so a misconfiguration reports itself instead of
 * hiding behind "the server hit an unexpected error".
 */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}
