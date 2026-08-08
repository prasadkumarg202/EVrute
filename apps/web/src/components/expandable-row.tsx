'use client';

/**
 * Disclosure row for tables where a row can expand to show detail (e.g. a
 * settlement's line items). This is the only client component `DataTable`
 * needs — it receives already-rendered React elements as props (the summary
 * cells and the detail panel), never a function, so it can sit downstream of
 * a Server Component without crossing the serialisation boundary.
 */

import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export function ExpandableRow({
  summaryCells,
  columnCount,
  detail,
  label,
}: {
  readonly summaryCells: ReactNode;
  readonly columnCount: number;
  readonly detail: ReactNode;
  readonly label: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <>
      <tr className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--surface-sunken)]">
        <td className="w-10 px-2 py-3 align-middle">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
            className="flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className={cn('size-4 transition-transform', open && 'rotate-90')}
              aria-hidden="true"
            >
              <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </td>
        {summaryCells}
      </tr>
      {open && (
        <tr id={panelId} className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)]/50 last:border-0">
          <td colSpan={columnCount + 1} className="px-4 py-3">
            {detail}
          </td>
        </tr>
      )}
    </>
  );
}
