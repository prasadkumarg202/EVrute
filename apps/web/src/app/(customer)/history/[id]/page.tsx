import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { formatINR, formatKwh, presentStatus, SESSION_STATUS } from '@evrute/core';
import { Badge, Card, CardBody } from '@/components/ui/index';
import { createSupabaseServerClient, getSessionUser } from '@/lib/supabase/server';
import { PrintButton } from '@/components/history/print-button';

export const metadata: Metadata = {
  title: 'Invoice',
  robots: { index: false, follow: false },
};

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

interface LineItem {
  readonly label: string;
  readonly qty: number;
  readonly unit: string;
  readonly rate: number;
  readonly amount: number;
}

function isLineItem(value: unknown): value is LineItem {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['label'] === 'string' &&
    typeof v['qty'] === 'number' &&
    typeof v['unit'] === 'string' &&
    typeof v['rate'] === 'number' &&
    typeof v['amount'] === 'number'
  );
}

export default async function InvoiceDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/history/${id}`)}`);

  const supabase = await createSupabaseServerClient();
  const { data: invoice } = await supabase.from('invoices').select('*').eq('session_id', id).maybeSingle();
  if (!invoice) notFound();

  const [{ data: session }, { data: station }] = await Promise.all([
    supabase.from('sessions').select('*').eq('id', id).maybeSingle(),
    supabase.from('stations').select('*').eq('id', invoice.station_id).maybeSingle(),
  ]);

  const lineItems: readonly LineItem[] = Array.isArray(invoice.line_items)
    ? (invoice.line_items as readonly unknown[]).filter(isLineItem)
    : [];
  const status = session ? presentStatus(SESSION_STATUS, session.status) : null;

  return (
    <div className="mx-auto max-w-lg px-4 pt-4 pb-10 print:max-w-none print:px-0 print:py-0 sm:px-5">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link
          href="/history"
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <svg viewBox="0 0 24 24" fill="none" className="size-3.5" aria-hidden="true">
            <path d="M15 6 9 12l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          History
        </Link>
        <PrintButton />
      </div>

      <Card className="mt-4 print:border-none print:shadow-none">
        <CardBody>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-display text-lg font-semibold text-[var(--text-primary)]">EVRute</p>
              <p className="text-xs text-[var(--text-muted)]">Tax invoice</p>
            </div>
            {status && (
              <Badge tone={status.tone} srHint={status.srHint}>
                {status.label}
              </Badge>
            )}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-[var(--text-muted)]">Invoice number</dt>
              <dd className="tabular font-medium text-[var(--text-primary)]">{invoice.invoice_number}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-muted)]">Issued</dt>
              <dd className="text-[var(--text-primary)]">
                {new Date(invoice.issued_at).toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-[var(--text-muted)]">Station</dt>
              <dd className="text-[var(--text-primary)]">
                {station ? `${station.name}, ${station.address_line1}, ${station.city}` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-muted)]">Energy delivered</dt>
              <dd className="tabular text-[var(--text-primary)]">{formatKwh(invoice.energy_kwh)}</dd>
            </div>
          </dl>

          <div className="mt-5 overflow-hidden rounded-lg border border-[var(--border-subtle)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-sunken)] text-xs text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Item</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Rate</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {lineItems.map((item, index) => (
                  <tr key={`${item.label}-${index}`}>
                    <td className="px-3 py-2 text-[var(--text-primary)]">{item.label}</td>
                    <td className="tabular px-3 py-2 text-right text-[var(--text-secondary)]">
                      {item.qty} {item.unit}
                    </td>
                    <td className="tabular px-3 py-2 text-right text-[var(--text-secondary)]">{formatINR(item.rate)}</td>
                    <td className="tabular px-3 py-2 text-right font-medium text-[var(--text-primary)]">
                      {formatINR(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="mt-4 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--text-secondary)]">Subtotal</dt>
              <dd className="tabular text-[var(--text-primary)]">{formatINR(invoice.subtotal)}</dd>
            </div>
            {invoice.discount_amount > 0 && (
              <div className="flex justify-between">
                <dt className="text-[var(--text-secondary)]">Discount</dt>
                <dd className="tabular text-success-600">−{formatINR(invoice.discount_amount)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-[var(--text-secondary)]">Tax</dt>
              <dd className="tabular text-[var(--text-primary)]">{formatINR(invoice.tax_amount)}</dd>
            </div>
            <div className="flex justify-between border-t border-[var(--border-subtle)] pt-1.5 text-base font-semibold">
              <dt className="text-[var(--text-primary)]">Total</dt>
              <dd className="tabular text-[var(--text-primary)]">{formatINR(invoice.total)}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}
