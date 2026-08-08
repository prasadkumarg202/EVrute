'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@evrute/db/types';
import { env } from '@/lib/env';

/**
 * Browser Supabase client — a singleton.
 *
 * Creating one per component would open a new Realtime WebSocket each time
 * and leak subscriptions on unmount. The live-session screen depends on
 * exactly one connection staying open across navigations.
 */
let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createSupabaseBrowserClient() {
  client ??= createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      realtime: {
        // Cap the reconnect storm when a phone moves between cells.
        params: { eventsPerSecond: 5 },
      },
    },
  );
  return client;
}
