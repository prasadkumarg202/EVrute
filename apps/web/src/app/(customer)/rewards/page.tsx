import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { carbonSavedKg, formatKwh } from '@evrute/core';
import { Badge, Card, CardBody, EmptyState, Stat } from '@/components/ui/index';
import { createSupabaseServerClient, getSessionUser } from '@/lib/supabase/server';
import { CopyReferralButton } from '@/components/rewards/copy-referral-button';

export const metadata: Metadata = {
  title: 'Rewards',
  robots: { index: false, follow: false },
};

export default async function RewardsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=%2Frewards');

  const supabase = await createSupabaseServerClient();

  const [{ data: completedSessions }, { count: bonusCount }, { data: coupons }] = await Promise.all([
    supabase.from('sessions').select('energy_kwh').eq('user_id', user.id).eq('status', 'completed'),
    supabase
      .from('wallet_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('reason', 'referral_bonus'),
    supabase
      .from('coupons')
      .select('*')
      .eq('is_active', true)
      .gt('valid_to', new Date().toISOString())
      .order('valid_to', { ascending: true })
      .limit(20),
  ]);

  const totalKwh = (completedSessions ?? []).reduce((sum, s) => sum + s.energy_kwh, 0);

  return (
    <div className="mx-auto max-w-lg px-4 pt-4 pb-10 sm:px-5">
      <h1 className="font-display text-xl font-semibold text-[var(--text-primary)]">Rewards</h1>

      <Card className="mt-4">
        <CardBody>
          <p className="text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Your referral code</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="tabular font-display text-2xl font-semibold tracking-wide text-[var(--text-primary)]">
              {user.referralCode}
            </span>
            <CopyReferralButton code={user.referralCode} />
          </div>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            Share this code — when a friend signs up with it, you both get a wallet bonus.
          </p>
        </CardBody>
      </Card>

      <div className="mt-4 grid grid-cols-3 gap-2.5">
        <Stat label="Energy charged" value={formatKwh(totalKwh, 0)} />
        <Stat label="CO₂ avoided" value={`${carbonSavedKg(totalKwh).toFixed(1)} kg`} tone="success" />
        <Stat label="Referral bonuses" value={String(bonusCount ?? 0)} />
      </div>

      <section aria-labelledby="coupons-heading" className="mt-8">
        <h2 id="coupons-heading" className="font-display text-base font-semibold text-[var(--text-primary)]">
          Active coupons
        </h2>
        {(coupons ?? []).length === 0 ? (
          <EmptyState
            className="mt-2"
            title="No active coupons right now"
            description="Check back later for offers and station promotions."
          />
        ) : (
          <ul className="mt-3 space-y-2.5">
            {(coupons ?? []).map((coupon) => (
              <li key={coupon.id}>
                <Card>
                  <CardBody className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">{coupon.title}</p>
                      {coupon.description && (
                        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{coupon.description}</p>
                      )}
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Valid until{' '}
                        {new Date(coupon.valid_to).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <Badge tone="info" dot={false}>
                      {coupon.discount_type === 'flat' ? `₹${coupon.value} off` : `${coupon.value}% off`}
                    </Badge>
                  </CardBody>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
