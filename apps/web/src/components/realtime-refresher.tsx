'use client';

/**
 * Invisible client component that re-fetches the current Server Component
 * tree whenever a Postgres change lands on `table` — this is what makes the
 * admin "live sessions" feed live without hand-rolling client-side state
 * that could drift from what RLS actually allows the viewer to see.
 *
 * Realtime respects the same RLS policies as a normal query, so an owner
 * subscribed to `sessions` only ever receives events for their own
 * stations' rows — there is nothing extra to scope here.
 */

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function RealtimeRefresher({ table, intervalMs = 4000 }: { readonly table: string; readonly intervalMs?: number }) {
  const router = useRouter();
  const pendingRef = useRef(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`realtime-refresh-${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        if (pendingRef.current) return;
        pendingRef.current = true;
        setTimeout(() => {
          pendingRef.current = false;
          router.refresh();
        }, intervalMs);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [table, intervalMs, router]);

  return null;
}
