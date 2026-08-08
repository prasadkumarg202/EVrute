/// <reference lib="webworker" />
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { NetworkOnly, Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST ?? [],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    /*
     * Money and charging control must NEVER be served from cache. A cached
     * wallet balance is a wrong balance, and a cached session state could
     * show "charging" for a session that already stopped. Explicitly
     * NetworkOnly, ahead of the default catch-all.
     */
    {
      matcher: ({ url }) =>
        url.pathname.startsWith('/api/') ||
        url.pathname.includes('/rest/v1/rpc/') ||
        url.pathname.includes('/auth/v1/'),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
});

serwist.addEventListeners();

/** Web Push — session milestones and wallet events. */
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload: { title?: string; body?: string; url?: string; tag?: string } = {};
  try {
    payload = event.data.json() as typeof payload;
  } catch {
    payload = { title: 'EVRute', body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'EVRute', {
      body: payload.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      // Tagging collapses repeat notifications for the same session instead
      // of stacking one per MeterValues update.
      tag: payload.tag ?? 'evrute',
      data: { url: payload.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data as { url?: string } | undefined)?.url ?? '/';

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Focus an existing tab rather than opening a duplicate.
      for (const client of clientsList) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
