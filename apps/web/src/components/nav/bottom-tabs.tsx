'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface Tab {
  readonly href: string;
  readonly label: string;
  readonly icon: (active: boolean) => ReactNode;
}

const TABS: readonly Tab[] = [
  {
    href: '/',
    label: 'Map',
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" className="size-6">
        <path
          d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21Z"
          stroke="currentColor"
          strokeWidth={active ? 2 : 1.6}
        />
        <circle cx="12" cy="9.5" r="2.3" stroke="currentColor" strokeWidth={active ? 2 : 1.6} />
      </svg>
    ),
  },
  {
    href: '/wallet',
    label: 'Wallet',
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" className="size-6">
        <path
          d="M3 7.5A2.5 2.5 0 0 1 5.5 5h11A2.5 2.5 0 0 1 19 7.5V8H5.5A2.5 2.5 0 0 1 3 5.5v2Z"
          stroke="currentColor"
          strokeWidth={active ? 2 : 1.6}
        />
        <rect x="3" y="8" width="18" height="11" rx="2" stroke="currentColor" strokeWidth={active ? 2 : 1.6} />
        <circle cx="16.5" cy="13.5" r="1.2" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: '/history',
    label: 'History',
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" className="size-6">
        <path
          d="M3 12a9 9 0 1 0 2.6-6.3M3 4v5h5"
          stroke="currentColor"
          strokeWidth={active ? 2 : 1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M12 8v4.5l3 2" stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/vehicles',
    label: 'Vehicle',
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" className="size-6">
        <path
          d="M4 16.5V12l1.8-4.6A2 2 0 0 1 7.7 6h8.6a2 2 0 0 1 1.9 1.4L20 12v4.5"
          stroke="currentColor"
          strokeWidth={active ? 2 : 1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M4 12h16" stroke="currentColor" strokeWidth={active ? 2 : 1.6} />
        <circle cx="7.5" cy="16.5" r="1.5" stroke="currentColor" strokeWidth={active ? 2 : 1.6} />
        <circle cx="16.5" cy="16.5" r="1.5" stroke="currentColor" strokeWidth={active ? 2 : 1.6} />
      </svg>
    ),
  },
  {
    href: '/rewards',
    label: 'Rewards',
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" className="size-6">
        <circle cx="12" cy="8.5" r="4.5" stroke="currentColor" strokeWidth={active ? 2 : 1.6} />
        <path
          d="M8.2 12.5 7 20l5-2.5 5 2.5-1.2-7.5"
          stroke="currentColor"
          strokeWidth={active ? 2 : 1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

/** Routes that render full-screen, without the tab bar underneath. */
const FULL_SCREEN_PATTERNS = [/^\/station\//, /^\/session\//];

export function isFullScreenRoute(pathname: string): boolean {
  return FULL_SCREEN_PATTERNS.some((pattern) => pattern.test(pathname));
}

export function BottomTabs() {
  const pathname = usePathname();
  if (isFullScreenRoute(pathname)) return null;

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-subtle)] print:hidden',
        'bg-[var(--surface-card)]/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom,0px)]',
      )}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-2">
        {TABS.map((tab) => {
          const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 py-1.5',
                  'text-[11px] font-medium transition-colors',
                  active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
                )}
              >
                {tab.icon(active)}
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
