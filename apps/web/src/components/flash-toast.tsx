'use client';

/**
 * Fires a toast once, on mount, when a query-string flag is present after a
 * server-action redirect (e.g. `?saved=1`), then strips the flag from the
 * URL so a refresh doesn't repeat it. Server actions cannot call `useToast`
 * directly — they run before the client tree mounts — so this is the bridge.
 */

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import type { StatusTone } from '@evrute/core';

export function FlashToast({
  param,
  tone = 'success',
  title,
  description,
}: {
  readonly param: string;
  readonly tone?: StatusTone;
  readonly title: string;
  readonly description?: string;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { push } = useToast();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (searchParams.get(param) === null) return;
    fired.current = true;
    push({ tone, title, ...(description ? { description } : {}) });

    const next = new URLSearchParams(searchParams.toString());
    next.delete(param);
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, param]);

  return null;
}
