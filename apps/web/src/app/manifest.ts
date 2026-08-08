import type { MetadataRoute } from 'next';

/**
 * PWA manifest. `display: standalone` + maskable icons is what makes the
 * Android install prompt fire and the iOS home-screen launch look native.
 * Shortcuts appear on long-press of the installed icon.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'EVRute — EV charging across India',
    short_name: 'EVRute',
    description:
      'Find nearby EV chargers, see live availability, start a charge and pay from one wallet.',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#0b0f14',
    lang: 'en-IN',
    dir: 'ltr',
    categories: ['travel', 'utilities', 'navigation'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Find a charger', short_name: 'Map', url: '/?source=shortcut', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Wallet', short_name: 'Wallet', url: '/wallet?source=shortcut', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Charging history', short_name: 'History', url: '/history?source=shortcut', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
