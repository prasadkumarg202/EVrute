'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isFullScreenRoute } from '@/components/nav/bottom-tabs';

/**
 * Persistent entry point to the account screen.
 *
 * The customer surface is a five-tab app and a sixth tab for "Account"
 * would crowd the bar and dilute the primary actions. A small avatar in the
 * top-right is the conventional alternative and, more importantly, means
 * sign-out is reachable from every tab rather than buried in one of them.
 *
 * Hidden on full-screen routes (station detail, live session) for the same
 * reason the tab bar is: those screens own the viewport and have their own
 * back affordance.
 */
export function AccountButton({ initials }: { readonly initials: string }) {
  const pathname = usePathname();
  if (isFullScreenRoute(pathname)) return null;

  const isActive = pathname.startsWith('/account');

  return (
    <Link
      href="/account"
      aria-label="Account and settings"
      aria-current={isActive ? 'page' : undefined}
      className={[
        'fixed right-4 z-30 flex size-10 items-center justify-center rounded-full',
        'top-[calc(0.75rem+env(safe-area-inset-top,0px))]',
        'border border-[var(--border-strong)] bg-[var(--surface-card)]',
        'text-sm font-semibold text-[var(--text-secondary)] shadow-[var(--shadow-card)]',
        'transition-colors hover:bg-[var(--surface-sunken)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
        isActive && 'ring-2 ring-[var(--accent)]',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span aria-hidden="true">{initials}</span>
    </Link>
  );
}
