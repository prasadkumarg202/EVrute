'use client';

/**
 * Shared shell for the owner portal and the admin panel: a fixed sidebar on
 * desktop, collapsing into a top bar + slide-over drawer below the `lg`
 * breakpoint. One implementation so the two surfaces never visually drift.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export interface PortalNavItem {
  readonly href: string;
  readonly label: string;
}

export interface PortalShellProps {
  readonly brandLabel: string;
  readonly navItems: readonly PortalNavItem[];
  readonly userName: string;
  readonly userEmail: string | null;
  readonly roleLabel: string;
  readonly signOutAction: () => Promise<void>;
  readonly children: ReactNode;
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/owner' || href === '/admin') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({
  navItems,
  pathname,
  onNavigate,
}: {
  readonly navItems: readonly PortalNavItem[];
  readonly pathname: string;
  readonly onNavigate?: () => void;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {navItems.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              {...(onNavigate ? { onClick: onNavigate } : {})}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-11 items-center rounded-xl px-3 text-sm font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
                active
                  ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]',
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function SignOutButton({ signOutAction }: { readonly signOutAction: () => Promise<void> }) {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="flex h-10 w-full items-center justify-center rounded-xl border border-[var(--border-strong)] text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        Sign out
      </button>
    </form>
  );
}

export function PortalShell({
  brandLabel,
  navItems,
  userName,
  userEmail,
  roleLabel,
  signOutAction,
  children,
}: PortalShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer whenever navigation completes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-dvh bg-[var(--surface-page)]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-card)] lg:flex">
        <div className="flex h-16 items-center border-b border-[var(--border-subtle)] px-5">
          <span className="font-display text-lg font-semibold text-[var(--text-primary)]">{brandLabel}</span>
        </div>
        <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-4">
          <NavLinks navItems={navItems} pathname={pathname} />
        </nav>
        <div className="border-t border-[var(--border-subtle)] p-3">
          <div className="mb-3 px-2">
            <p className="truncate text-sm font-medium text-[var(--text-primary)]">{userName}</p>
            <p className="truncate text-xs text-[var(--text-muted)]">{userEmail ?? roleLabel}</p>
          </div>
          <SignOutButton signOutAction={signOutAction} />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 lg:hidden">
        <span className="font-display text-lg font-semibold text-[var(--text-primary)]">{brandLabel}</span>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={drawerOpen}
          aria-controls="portal-drawer"
          className="flex size-11 items-center justify-center rounded-xl text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <svg viewBox="0 0 24 24" fill="none" className="size-6" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-ink-950/40 backdrop-blur-[2px]"
          />
          <div
            id="portal-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="absolute inset-y-0 left-0 flex w-72 flex-col bg-[var(--surface-card)] shadow-[var(--shadow-sheet)]"
          >
            <div className="flex h-16 items-center justify-between border-b border-[var(--border-subtle)] px-4">
              <span className="font-display text-lg font-semibold text-[var(--text-primary)]">{brandLabel}</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation menu"
                className="flex size-10 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-sunken)]"
              >
                <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true">
                  <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-4">
              <NavLinks navItems={navItems} pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
            </nav>
            <div className="border-t border-[var(--border-subtle)] p-3">
              <div className="mb-3 px-2">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">{userName}</p>
                <p className="truncate text-xs text-[var(--text-muted)]">{userEmail ?? roleLabel}</p>
              </div>
              <SignOutButton signOutAction={signOutAction} />
            </div>
          </div>
        </div>
      )}

      <main className="lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
