'use client';

import { useCallback, useState } from 'react';
import type { Tables } from '@evrute/db';
import { formatINR } from '@evrute/core';
import { Button, Card, CardBody, EmptyState, Field, Sheet, Stat } from '@/components/ui/index';
import { useToast } from '@/components/ui/toast';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { waitForRazorpay } from '@/lib/razorpay-client';
import { apiPost } from '@/lib/api-client';
import { cn } from '@/lib/utils/cn';

type WalletRow = Tables<'wallets'>;
type WalletTransactionRow = Tables<'wallet_transactions'>;

const QUICK_AMOUNTS = [200, 500, 1000, 2000] as const;
const PAGE_SIZE = 25;

interface OrderResponse {
  readonly paymentId: string;
  readonly checkout: {
    readonly key: string;
    readonly order_id: string;
    readonly amount: number;
    readonly currency: string;
    readonly name: string;
    readonly description: string;
  };
}

interface VerifyResponse {
  readonly ok: true;
  readonly balance: number;
}

export function WalletClient({
  wallet,
  initialTransactions,
  razorpayKeyId,
  userName,
  userEmail,
  userPhone,
}: {
  readonly wallet: WalletRow | null;
  readonly initialTransactions: readonly WalletTransactionRow[];
  readonly razorpayKeyId: string | null;
  readonly userName: string;
  readonly userEmail: string | null;
  readonly userPhone: string | null;
}) {
  const supabase = createSupabaseBrowserClient();
  const toast = useToast();

  const [balance, setBalance] = useState(wallet?.balance ?? 0);
  const held = wallet?.held_amount ?? 0;
  const [transactions, setTransactions] = useState<readonly WalletTransactionRow[]>(initialTransactions);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialTransactions.length === PAGE_SIZE);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(200);
  const [customAmount, setCustomAmount] = useState('');
  const [processing, setProcessing] = useState(false);

  const spendable = Math.max(balance - held, 0);
  const amount = selectedAmount ?? Number(customAmount);
  const amountValid = Number.isFinite(amount) && amount >= 1 && amount <= 100_000;

  const loadMore = useCallback(async () => {
    const last = transactions[transactions.length - 1];
    if (!last) return;
    setLoadingMore(true);
    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .lt('id', last.id)
      .order('id', { ascending: false })
      .limit(PAGE_SIZE);
    setLoadingMore(false);
    if (error) {
      toast.push({ tone: 'danger', title: 'Could not load more transactions', description: error.message });
      return;
    }
    setTransactions((current) => [...current, ...(data ?? [])]);
    setHasMore((data ?? []).length === PAGE_SIZE);
  }, [supabase, transactions, toast]);

  async function startTopUp() {
    if (!razorpayKeyId || !amountValid) return;
    setProcessing(true);
    try {
      // apiPost surfaces the server's real message, or a readable fallback
      // for an empty/non-JSON body, instead of a raw JSON parse error.
      const order = await apiPost<OrderResponse>('/api/payments/razorpay/order', { amount });

      const Razorpay = await waitForRazorpay();
      if (!Razorpay) throw new Error('Payment provider failed to load. Check your connection and try again.');

      const checkoutInstance = new Razorpay({
        ...order.checkout,
        prefill: {
          ...(userName ? { name: userName } : {}),
          ...(userEmail ? { email: userEmail } : {}),
          ...(userPhone ? { contact: userPhone } : {}),
        },
        theme: { color: '#2f8f5b' },
        handler: (response) => {
          void (async () => {
            let verified: VerifyResponse;
            try {
              verified = await apiPost<VerifyResponse>('/api/payments/razorpay/verify', {
                paymentId: order.paymentId,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });
            } catch (cause) {
              // The money may well have left the account — the Razorpay
              // webhook is what reconciles this, so never tell the user the
              // payment failed outright.
              toast.push({
                tone: 'danger',
                title: 'Payment could not be confirmed',
                description:
                  (cause instanceof Error ? cause.message : 'Verification failed.') +
                  ' If money left your account it will be credited automatically within a few minutes.',
              });
              return;
            }
            setBalance(verified.balance);
            toast.push({ tone: 'success', title: 'Wallet topped up', description: `${formatINR(amount)} added.` });
            setSheetOpen(false);

            const { data } = await supabase
              .from('wallet_transactions')
              .select('*')
              .order('id', { ascending: false })
              .limit(1);
            if (data && data[0]) setTransactions((current) => [data[0]!, ...current]);
          })();
        },
        modal: { ondismiss: () => setProcessing(false) },
      });

      // A declined card, failed 3DS or insufficient funds fires
      // `payment.failed` while leaving the modal OPEN so the user can retry
      // with another method. That makes it distinct from `ondismiss`, and
      // without this handler the failure is silent: the user sees the sheet
      // sitting there with no explanation of why nothing happened.
      //
      // No wallet state changes here. The payments row stays 'created' and
      // is reconciled by the Razorpay `payment.failed` webhook, which is the
      // authoritative signal — this event is attacker-controllable client
      // input and is used only to tell the user what went wrong.
      checkoutInstance.on('payment.failed', (failure) => {
        const description =
          failure.error?.description ??
          failure.error?.reason ??
          'Your bank declined the payment. No money has left your account.';
        toast.push({
          tone: 'danger',
          title: 'Payment failed',
          description,
        });
        console.warn('razorpay: payment.failed', {
          paymentId: order.paymentId,
          code: failure.error?.code,
          step: failure.error?.step,
          source: failure.error?.source,
        });
      });

      checkoutInstance.open();
    } catch (cause) {
      toast.push({
        tone: 'danger',
        title: 'Could not start payment',
        description: cause instanceof Error ? cause.message : 'Please try again.',
      });
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-4 pb-10 sm:px-5">
      <h1 className="font-display text-xl font-semibold text-[var(--text-primary)]">Wallet</h1>

      <div className="mt-4 grid grid-cols-3 gap-2.5">
        <Stat label="Balance" value={formatINR(balance)} />
        <Stat label="Held" value={formatINR(held)} {...(held > 0 ? { tone: 'warning' as const } : {})} />
        <Stat label="Spendable" value={formatINR(spendable)} tone="success" />
      </div>

      {razorpayKeyId ? (
        <Button fullWidth size="lg" className="mt-4" onClick={() => setSheetOpen(true)}>
          Add money
        </Button>
      ) : (
        <Card className="mt-4">
          <CardBody>
            <p className="text-sm font-medium text-[var(--text-primary)]">Payments aren&apos;t configured yet</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Wallet top-ups are temporarily unavailable in this environment. Your existing balance and
              transaction history are unaffected.
            </p>
          </CardBody>
        </Card>
      )}

      <section aria-labelledby="ledger-heading" className="mt-8">
        <h2 id="ledger-heading" className="font-display text-base font-semibold text-[var(--text-primary)]">
          Transactions
        </h2>

        {transactions.length === 0 ? (
          <EmptyState
            className="mt-2"
            title="No transactions yet"
            description="Top up your wallet or complete a charging session to see activity here."
          />
        ) : (
          <>
            <ul className="mt-3 divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)]">
              {transactions.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {transactionLabel(tx.reason)}
                    </p>
                    <time dateTime={tx.created_at} className="text-xs text-[var(--text-muted)]">
                      {new Date(tx.created_at).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>
                  <span
                    className={cn(
                      'tabular shrink-0 text-sm font-semibold',
                      tx.direction === 'credit' ? 'text-success-600' : 'text-danger-600',
                    )}
                  >
                    {tx.direction === 'credit' ? '+' : '−'}
                    {formatINR(tx.amount)}
                  </span>
                </li>
              ))}
            </ul>
            {hasMore && (
              <Button
                variant="secondary"
                fullWidth
                className="mt-3"
                loading={loadingMore}
                onClick={() => void loadMore()}
              >
                Load more
              </Button>
            )}
          </>
        )}
      </section>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Add money"
        footer={
          <Button fullWidth loading={processing} disabled={!amountValid} onClick={() => void startTopUp()}>
            Pay {amountValid ? formatINR(amount) : ''}
          </Button>
        }
      >
        <div className="grid grid-cols-4 gap-2">
          {QUICK_AMOUNTS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={selectedAmount === value}
              onClick={() => {
                setSelectedAmount(value);
                setCustomAmount('');
              }}
              className={cn(
                'rounded-xl border px-2 py-3 text-sm font-semibold transition-colors',
                selectedAmount === value
                  ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
                  : 'border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]',
              )}
            >
              {formatINR(value, true)}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <Field
            label="Custom amount"
            type="number"
            inputMode="numeric"
            min={1}
            max={100000}
            prefix="₹"
            placeholder="Enter amount"
            value={customAmount}
            onChange={(e) => {
              setCustomAmount(e.target.value);
              setSelectedAmount(null);
            }}
          />
        </div>
      </Sheet>
    </div>
  );
}

function transactionLabel(reason: WalletTransactionRow['reason']): string {
  switch (reason) {
    case 'wallet_recharge':
      return 'Wallet top-up';
    case 'session_charge':
      return 'Charging session';
    case 'session_refund':
      return 'Session refund';
    case 'hold_placed':
      return 'Funds held for charging';
    case 'hold_released':
      return 'Hold released';
    case 'referral_bonus':
      return 'Referral bonus';
    case 'coupon_credit':
      return 'Coupon credit';
    case 'manual_adjustment':
      return 'Manual adjustment';
    case 'reservation_fee':
      return 'Reservation fee';
    case 'reservation_refund':
      return 'Reservation refund';
    default:
      return reason;
  }
}
