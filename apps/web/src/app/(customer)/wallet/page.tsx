import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Script from 'next/script';
import { createSupabaseServerClient, getSessionUser } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { WalletClient } from '@/components/wallet/wallet-client';

export const metadata: Metadata = {
  title: 'Wallet',
  robots: { index: false, follow: false },
};

const TRANSACTIONS_PAGE_SIZE = 25;

export default async function WalletPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=%2Fwallet');

  const supabase = await createSupabaseServerClient();

  const [{ data: wallet }, { data: transactions }] = await Promise.all([
    supabase.from('wallets').select('*').eq('user_id', user.id).maybeSingle(),
    supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('id', { ascending: false })
      .limit(TRANSACTIONS_PAGE_SIZE),
  ]);

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      <WalletClient
        wallet={wallet}
        initialTransactions={transactions ?? []}
        razorpayKeyId={env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? null}
        userName={user.fullName}
        userEmail={user.email}
        userPhone={user.phone}
      />
    </>
  );
}
