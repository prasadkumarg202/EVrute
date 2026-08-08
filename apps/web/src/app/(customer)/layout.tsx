'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { BottomTabs, isFullScreenRoute } from '@/components/nav/bottom-tabs';
import { cn } from '@/lib/utils/cn';

/**
 * Shared shell for the customer surface: bottom tab bar on every screen
 * except the ones that need the full viewport (station detail, live
 * session) — see `isFullScreenRoute`. Kept as a client component because
 * the show/hide decision depends on the current path and must not flash
 * the tab bar in on a full-screen route before hydration.
 */
export default function CustomerLayout({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();
  const showTabBar = !isFullScreenRoute(pathname);

  return (
    <div className="min-h-dvh bg-[var(--surface-page)]">
      <div className={cn(showTabBar && 'pb-[calc(3.75rem+env(safe-area-inset-bottom,0px))]')}>
        {children}
      </div>
      {showTabBar && <BottomTabs />}
    </div>
  );
}
