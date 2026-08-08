import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { PortalShell, type PortalNavItem } from '@/components/nav/portal-shell';
import { signOutAction } from '@/lib/actions/auth';
import { getSessionUser } from '@/lib/supabase/server';

const NAV_ITEMS: readonly PortalNavItem[] = [
  { href: '/owner', label: 'Dashboard' },
  { href: '/owner/stations', label: 'Stations' },
  { href: '/owner/chargers', label: 'Chargers' },
  { href: '/owner/sessions', label: 'Sessions' },
  { href: '/owner/settlements', label: 'Settlements' },
  { href: '/owner/reviews', label: 'Reviews' },
  { href: '/owner/support', label: 'Support' },
];

export default async function OwnerLayout({ children }: { readonly children: ReactNode }) {
  // Middleware already gates `/owner` by role; this is the defence-in-depth
  // check plus the source of the user info the shell renders.
  const user = await getSessionUser();
  if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
    redirect('/login?next=/owner');
  }

  return (
    <PortalShell
      brandLabel="EVRute · Owner"
      navItems={NAV_ITEMS}
      userName={user.fullName || 'Station owner'}
      userEmail={user.email}
      roleLabel="Owner"
      signOutAction={signOutAction}
    >
      {children}
    </PortalShell>
  );
}
