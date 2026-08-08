import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { formatINR } from '@evrute/core';
import { Badge, Card, CardBody } from '@/components/ui/index';
import { ThemeToggle } from '@/components/account/theme-toggle';
import { ProfileForm } from '@/components/account/profile-form';
import { SignOutButton } from '@/components/account/sign-out-button';
import { createSupabaseServerClient, getSessionUser } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Account',
  description: 'Manage your EVRute profile, appearance and session.',
  robots: { index: false, follow: false },
};

const ROLE_LABEL: Record<string, string> = {
  customer: 'Driver',
  owner: 'Station owner',
  admin: 'Administrator',
  employee: 'Support',
};

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/account');

  const supabase = await createSupabaseServerClient();

  const [{ data: wallet }, { count: sessionCount }] = await Promise.all([
    supabase.from('wallets').select('balance, held_amount').eq('user_id', user.id).maybeSingle(),
    supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed'),
  ]);

  return (
    <div className="mx-auto max-w-lg px-4 pt-4 pb-10 sm:px-5">
      <h1 className="font-display text-xl font-semibold text-[var(--text-primary)]">Account</h1>

      <Card className="mt-4">
        <CardBody className="pt-4">
          <div className="flex items-start gap-3">
            <div
              aria-hidden="true"
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--accent-subtle)] font-display text-base font-semibold text-[var(--accent)]"
            >
              {(user.fullName || user.email || '?').trim().charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base font-semibold text-[var(--text-primary)]">
                {user.fullName || 'Unnamed driver'}
              </p>
              <p className="truncate text-sm text-[var(--text-secondary)]">
                {user.email ?? user.phone ?? 'No contact on file'}
              </p>
              <div className="mt-2">
                <Badge tone="neutral" dot={false}>
                  {ROLE_LABEL[user.role] ?? user.role}
                </Badge>
              </div>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--border-subtle)] pt-4">
            <div>
              <dt className="text-xs text-[var(--text-muted)]">Balance</dt>
              <dd className="tabular mt-0.5 text-sm font-semibold text-[var(--text-primary)]">
                {formatINR(wallet?.balance ?? 0)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-muted)]">Charges</dt>
              <dd className="tabular mt-0.5 text-sm font-semibold text-[var(--text-primary)]">
                {sessionCount ?? 0}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-muted)]">Referral</dt>
              <dd className="mt-0.5 font-mono text-sm font-semibold text-[var(--text-primary)]">
                {user.referralCode}
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <section className="mt-6" aria-labelledby="profile-heading">
        <h2
          id="profile-heading"
          className="mb-2 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase"
        >
          Your details
        </h2>
        <Card>
          <CardBody className="pt-4">
            <ProfileForm
              fullName={user.fullName}
              email={user.email}
              phone={user.phone}
            />
          </CardBody>
        </Card>
      </section>

      <section className="mt-6" aria-labelledby="appearance-heading">
        <h2
          id="appearance-heading"
          className="mb-2 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase"
        >
          Appearance
        </h2>
        <Card>
          <CardBody className="pt-4">
            <ThemeToggle />
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Dark mode is easier on the eyes at a charger after dark.
            </p>
          </CardBody>
        </Card>
      </section>

      {(user.role === 'owner' || user.role === 'admin' || user.role === 'employee') && (
        <section className="mt-6" aria-labelledby="portals-heading">
          <h2
            id="portals-heading"
            className="mb-2 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase"
          >
            Switch surface
          </h2>
          <Card>
            <CardBody className="divide-y divide-[var(--border-subtle)] pt-0">
              {(user.role === 'owner' || user.role === 'admin') && (
                <Link
                  href="/owner"
                  className="flex items-center justify-between py-3.5 text-sm font-medium text-[var(--text-primary)]"
                >
                  Owner portal
                  <span aria-hidden="true" className="text-[var(--text-muted)]">
                    →
                  </span>
                </Link>
              )}
              {(user.role === 'admin' || user.role === 'employee') && (
                <Link
                  href="/admin"
                  className="flex items-center justify-between py-3.5 text-sm font-medium text-[var(--text-primary)]"
                >
                  Admin panel
                  <span aria-hidden="true" className="text-[var(--text-muted)]">
                    →
                  </span>
                </Link>
              )}
            </CardBody>
          </Card>
        </section>
      )}

      <section className="mt-6" aria-labelledby="session-heading">
        <h2
          id="session-heading"
          className="mb-2 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase"
        >
          Session
        </h2>
        <Card>
          <CardBody className="pt-4">
            <SignOutButton />
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Signing out ends this session on this device only. An active charge keeps
              running — you can sign back in to stop it.
            </p>
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
