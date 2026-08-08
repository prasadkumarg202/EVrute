import type { Metadata } from 'next';
import { Card, CardBody } from '@/components/ui/index';

export const metadata: Metadata = {
  title: "You're offline",
  robots: { index: false, follow: false },
};

/**
 * PWA offline fallback, served by the service worker (see app/sw.ts)
 * whenever a document request fails with no network. Money and charging
 * control are NetworkOnly in the worker, so this page is honest about
 * what genuinely still works versus what needs a connection.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <div
        aria-hidden="true"
        className="flex size-16 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] text-[var(--text-muted)]"
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-8">
          <path
            d="M3 3l18 18M8.5 8.5A11.9 11.9 0 0 0 3 12c0 .3 0 .6.03.9M12 4.5c3.9 0 7.4 1.6 9.97 4.2M6.5 12.5a7 7 0 0 1 3.5-2.9M9.5 16.5a3.3 3.3 0 0 1 2.5-1.2c.5 0 1 .1 1.4.3M12 19.5h.01"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div>
        <h1 className="font-display text-xl font-semibold text-[var(--text-primary)]">
          You&apos;re offline
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--text-secondary)]">
          EVRute couldn&apos;t reach the network. Reconnect and reopen the app to keep going.
        </p>
      </div>

      <Card className="w-full max-w-sm text-left">
        <CardBody>
          <p className="text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">
            What still works
          </p>
          <ul className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
            <li>Pages you&apos;ve already opened may still be viewable from cache.</li>
            <li>The app will reconnect automatically once your signal returns.</li>
          </ul>
          <p className="mt-4 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">
            What needs a connection
          </p>
          <ul className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
            <li>Live connector availability and station search.</li>
            <li>Starting, stopping or monitoring a charging session.</li>
            <li>Wallet balance, top-ups and payments.</li>
          </ul>
        </CardBody>
      </Card>

      <p className="text-xs text-[var(--text-muted)]">
        If you are mid-charge, the charger keeps running on its own — reconnect to see live
        progress again.
      </p>
    </div>
  );
}
