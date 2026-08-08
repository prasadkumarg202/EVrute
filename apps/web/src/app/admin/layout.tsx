import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { PortalShell, type PortalNavItem } from '@/components/nav/portal-shell';
import { signOutAction } from '@/lib/actions/auth';
import { getSessionUser } from '@/lib/supabase/server';

const NAV_ITEMS: readonly PortalNavItem[] = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/stations', label: 'Stations & owners' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/settlements', label: 'Settlements' },
  { href: '/admin/payments', label: 'Payments' },
  { href: '/admin/coupons', label: 'Coupons' },
  { href: '/admin/tickets', label: 'Tickets' },
  { href: '/admin/audit', label: 'Audit log' },
];

export default async function AdminLayout({ children }: { readonly children: ReactNode }) {
  const user = await getSessionUser();
  if (!user || (user.role !== 'admin' && user.role !== 'employee')) {
    redirect('/login?next=/admin');
  }

  return (
    <PortalShell
      brandLabel="EVRute · Admin"
      navItems={NAV_ITEMS}
      userName={user.fullName || 'Staff'}
      userEmail={user.email}
      roleLabel={user.role === 'admin' ? 'Administrator' : 'Employee'}
      signOutAction={signOutAction}
    >
      {children}
    </PortalShell>
  );
}
