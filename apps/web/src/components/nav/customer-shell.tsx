'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { BottomTabs, isFullScreenRoute } from '@/components/nav/bottom-tabs';
import { AccountButton } from '@/components/nav/account-button';
import { cn } from '@/lib/utils/cn';

/**
 * Bottom tab bar on every screen except those needing the full viewport
 * (station detail, live session) — see `isFullScreenRoute`. Client component
 * because the show/hide decision depends on the current path and must not
 * flash the tab bar in on a full-screen route before hydration.
 *
 * The account avatar is rendered here rather than as a sixth tab: five is
 * already the practical limit for a thumb-reachable bar, and sign-out needs
 * to be reachable from every screen rather than buried inside one tab.
 */
export function CustomerShell({
  children,
  initials,
}: {
  readonly children: ReactNode;
  readonly initials?: string;
}) {
  const pathname = usePathname();
  const showTabBar = !isFullScreenRoute(pathname);

  return (
    <div className="min-h-dvh bg-[var(--surface-page)]">
      {initials && <AccountButton initials={initials} />}
      <div className={cn(showTabBar && 'pb-[calc(3.75rem+env(safe-area-inset-bottom,0px))]')}>
        {children}
      </div>
      {showTabBar && <BottomTabs />}
    </div>
  );
}
