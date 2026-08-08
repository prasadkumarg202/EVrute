import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Badge, Card, CardBody, EmptyState, ErrorState } from '@/components/ui';
import { TicketReplyForm } from '@/components/forms/ticket-reply-form';
import { sendTicketMessageAction } from './actions';
import { presentStatus, TICKET_STATUS } from '@evrute/core';
import { requireRole, createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/utils/format';
import type { EntityActionState } from '@/lib/entity-action-state';

export const metadata: Metadata = { title: 'Support' };

export default async function OwnerSupportPage() {
  await requireRole('owner', 'admin');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--text-primary)]">Support</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Tickets raised about your stations.</p>
      </div>
      <Suspense fallback={<Card><CardBody><div className="skeleton h-40 rounded-xl" /></CardBody></Card>}>
        <TicketsList />
      </Suspense>
    </div>
  );
}

async function TicketsList() {
  const user = await requireRole('owner', 'admin');
  const supabase = await createSupabaseServerClient();

  const { data: stations } = await supabase.from('stations').select('id, name').eq('owner_id', user.id);
  const stationIds = (stations ?? []).map((s) => s.id);
  const stationNames = new Map((stations ?? []).map((s) => [s.id, s.name]));

  if (stationIds.length === 0) {
    return (
      <Card>
        <CardBody>
          <EmptyState title="No stations yet" description="Support tickets about your stations will appear here." />
        </CardBody>
      </Card>
    );
  }

  const { data: tickets, error } = await supabase
    .from('tickets')
    .select('id, station_id, subject, description, status, priority, created_at')
    .in('station_id', stationIds)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !tickets) {
    return (
      <Card>
        <CardBody>
          <ErrorState title="Couldn't load tickets" {...(error?.message ? { description: error.message } : {})} />
        </CardBody>
      </Card>
    );
  }

  if (tickets.length === 0) {
    return (
      <Card>
        <CardBody>
          <EmptyState title="No tickets" description="Nothing open right now." />
        </CardBody>
      </Card>
    );
  }

  const ticketIds = tickets.map((t) => t.id);
  const { data: messages } = await supabase
    .from('ticket_messages')
    .select('id, ticket_id, author_id, body, is_internal, created_at, profiles(full_name)')
    .in('ticket_id', ticketIds)
    .eq('is_internal', false)
    .order('created_at', { ascending: true });

  const messagesByTicket = new Map<string, NonNullable<typeof messages>>();
  for (const m of messages ?? []) {
    const list = messagesByTicket.get(m.ticket_id) ?? [];
    list.push(m);
    messagesByTicket.set(m.ticket_id, list);
  }

  return (
    <div className="flex flex-col gap-4">
      {tickets.map((ticket) => {
        const status = presentStatus(TICKET_STATUS, ticket.status);
        const boundAction = sendTicketMessageAction.bind(null, ticket.id) as (
          state: EntityActionState,
          formData: FormData,
        ) => Promise<EntityActionState>;
        const threadMessages = messagesByTicket.get(ticket.id) ?? [];

        return (
          <Card key={ticket.id}>
            <CardBody>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{ticket.subject}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {ticket.station_id ? (stationNames.get(ticket.station_id) ?? 'Station') : 'General'} ·{' '}
                    {formatDateTime(ticket.created_at)}
                  </p>
                </div>
                <Badge tone={status.tone} srHint={status.srHint}>
                  {status.label}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">{ticket.description}</p>

              {threadMessages.length > 0 && (
                <div className="mt-3 flex flex-col gap-2 border-t border-[var(--border-subtle)] pt-3">
                  {threadMessages.map((m) => (
                    <div key={m.id} className="rounded-lg bg-[var(--surface-sunken)] px-3 py-2 text-sm">
                      <p className="text-xs font-medium text-[var(--text-secondary)]">
                        {m.profiles?.full_name || 'Support'} · {formatDateTime(m.created_at)}
                      </p>
                      <p className="mt-0.5 text-[var(--text-primary)]">{m.body}</p>
                    </div>
                  ))}
                </div>
              )}

              <TicketReplyForm action={boundAction} />
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
