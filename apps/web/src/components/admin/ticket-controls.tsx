'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import { setTicketStatusAction, assignTicketAction } from '@/app/admin/tickets/actions';
import type { Database } from '@evrute/db/types';

type TicketStatus = Database['public']['Enums']['ticket_status'];

const STATUSES: readonly TicketStatus[] = ['open', 'in_progress', 'resolved', 'closed'];

export function TicketStatusSelect({ ticketId, currentStatus }: { readonly ticketId: string; readonly currentStatus: TicketStatus }) {
  const [status, setStatus] = useState(currentStatus);
  const [isPending, startTransition] = useTransition();
  const { push } = useToast();
  const router = useRouter();

  return (
    <select
      aria-label="Ticket status"
      value={status}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value as TicketStatus;
        setStatus(next);
        startTransition(async () => {
          const result = await setTicketStatusAction(ticketId, next);
          if (!result.ok) {
            push({ tone: 'danger', title: 'Could not update status', ...(result.error ? { description: result.error } : {}) });
            setStatus(currentStatus);
            return;
          }
          router.refresh();
        });
      }}
      className="h-9 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-card)] px-2 text-sm text-[var(--text-primary)]"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s.replace('_', ' ')}
        </option>
      ))}
    </select>
  );
}

export function TicketAssignSelect({
  ticketId,
  assignedTo,
  staff,
}: {
  readonly ticketId: string;
  readonly assignedTo: string | null;
  readonly staff: readonly { id: string; full_name: string }[];
}) {
  const [value, setValue] = useState(assignedTo ?? '');
  const [isPending, startTransition] = useTransition();
  const { push } = useToast();
  const router = useRouter();

  return (
    <select
      aria-label="Assign to"
      value={value}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value;
        setValue(next);
        startTransition(async () => {
          const result = await assignTicketAction(ticketId, next || null);
          if (!result.ok) {
            push({ tone: 'danger', title: 'Could not assign ticket', ...(result.error ? { description: result.error } : {}) });
            setValue(assignedTo ?? '');
            return;
          }
          router.refresh();
        });
      }}
      className="h-9 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-card)] px-2 text-sm text-[var(--text-primary)]"
    >
      <option value="">Unassigned</option>
      {staff.map((s) => (
        <option key={s.id} value={s.id}>
          {s.full_name || 'Unnamed'}
        </option>
      ))}
    </select>
  );
}
