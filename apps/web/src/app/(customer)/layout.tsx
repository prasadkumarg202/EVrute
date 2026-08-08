import type { ReactNode } from 'react';
import { CustomerShell } from '@/components/nav/customer-shell';
import { initialsFrom } from '@/lib/utils/format';
import { getSessionUser } from '@/lib/supabase/server';

/**
 * Customer shell. A Server Component so it can read the signed-in profile
 * for the account avatar without a client-side round trip on every
 * navigation; the show/hide logic lives in the client child.
 */
export default async function CustomerLayout({ children }: { readonly children: ReactNode }) {
  const user = await getSessionUser();

  return (
    <CustomerShell
      {...(user ? { initials: initialsFrom(user.fullName, user.email ?? user.phone ?? '') } : {})}
    >
      {children}
    </CustomerShell>
  );
}
