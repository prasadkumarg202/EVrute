import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Badge, Card, CardBody } from '@/components/ui';
import { DataTable, DataTableSkeleton, type DataTableColumn } from '@/components/data-table';
import { TicketStatusSelect, TicketAssignSelect } from '@/components/admin/ticket-controls';
import { AdminTicketReplyForm } from '@/components/forms/admin-ticket-reply-form';
import { sendAdminTicketMessageAction } from './actions';
import { presentStatus, TICKET_STATUS } from '@evrute/core';
import { requireRole, createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/utils/format';
import type { EntityActionState } from '@/lib/entity-action-state';
import type { Database } from '@evrute/db/types';

export const metadata: Metadata = { title: 'Tickets' };

const PAGE_SIZE = 15;
const STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;

interface TicketRow {
  readonly id: string;
  readonly subject: string;
  readonly description: string;
  readonly status: Database['public']['Enums']['ticket_status'];
  readonly priority: string;
  readonly userName: string;
  readonly stationName: string;
  readonly assignedTo: string | null;
  readonly createdAt: string;
}

export default async function AdminTicketsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole('admin', 'employee');
  const sp = await searchParams;
  const page = Math.max(Number(sp['page'] ?? '1') || 1, 1);
  const status = typeof sp['status'] === 'string' ? sp['status'] : '';
  const resolvedParams: Record<string, string | undefined> = {
    page: sp['page'] as string | undefined,
    status: status || undefined,
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--text-primary)]">Tickets</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Support tickets across the whole platform.</p>
      </div>

      <Card>
        <CardBody>
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div>
              <label htmlFor="status" className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                Status
              </label>
              <select
                id="status"
                name="status"
                defaultValue={status}
                className="h-10 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-card)] px-2.5 text-sm text-[var(--text-primary)]"
              >
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {presentStatus(TICKET_STATUS, s).label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="inline-flex h-10 items-center rounded-lg bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-text)] hover:bg-[var(--accent-hover)]"
            >
              Apply
            </button>
          </form>
        </CardBody>
      </Card>

      <Suspense key={`${page}-${status}`} fallback={<DataTableSkeleton columnCount={6} />}>
        <TicketsTable page={page} status={status} searchParams={resolvedParams} />
      </Suspense>
    </div>
  );
}

async function TicketsTable({
  page,
  status,
  searchParams,
}: {
  readonly page: number;
  readonly status: string;
  readonly searchParams: Record<string, string | undefined>;
}) {
  const supabase = await createSupabaseServerClient();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('role', ['admin', 'employee'])
    .order('full_name');

  let query = supabase
    .from('tickets')
    .select(
      'id, subject, description, status, priority, assigned_to, created_at, station_id, profiles!tickets_user_id_fkey(full_name), stations(name)',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status as never);

  const { data, count, error } = await query.range(from, to);

  if (error || !data) {
    return (
      <DataTable<TicketRow>
        columns={[]}
        rows={[]}
        rowKey={(r) => r.id}
        caption="Tickets"
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={0}
        basePath="/admin/tickets"
        searchParams={searchParams}
        emptyTitle="Couldn't load tickets"
        errorMessage={error?.message ?? 'Unknown error'}
      />
    );
  }

  const rows: TicketRow[] = data.map((t) => ({
    id: t.id,
    subject: t.subject,
    description: t.description,
    status: t.status,
    priority: t.priority,
    userName: t.profiles?.full_name || 'Customer',
    stationName: t.stations?.name ?? 'General',
    assignedTo: t.assigned_to,
    createdAt: t.created_at,
  }));

  const ticketIds = rows.map((r) => r.id);
  const { data: messages } = await supabase
    .from('ticket_messages')
    .select('id, ticket_id, body, is_internal, created_at, profiles(full_name)')
    .in('ticket_id', ticketIds)
    .order('created_at', { ascending: true });

  type MessageRow = NonNullable<typeof messages>[number];
  const messagesByTicket = new Map<string, MessageRow[]>();
  for (const m of messages ?? []) {
    const list = messagesByTicket.get(m.ticket_id) ?? [];
    list.push(m);
    messagesByTicket.set(m.ticket_id, list);
  }

  const columns: readonly DataTableColumn<TicketRow>[] = [
    { key: 'subject', header: 'Subject', render: (r) => r.subject },
    { key: 'user', header: 'Customer', render: (r) => r.userName },
    { key: 'station', header: 'Station', render: (r) => r.stationName },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <TicketStatusSelect ticketId={r.id} currentStatus={r.status} />,
    },
    {
      key: 'assigned',
      header: 'Assigned to',
      render: (r) => <TicketAssignSelect ticketId={r.id} assignedTo={r.assignedTo} staff={staff ?? []} />,
    },
    { key: 'created', header: 'Created', render: (r) => formatDateTime(r.createdAt) },
  ];

  return (
    <DataTable<TicketRow>
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      caption="Tickets"
      page={page}
      pageSize={PAGE_SIZE}
      totalCount={count ?? rows.length}
      basePath="/admin/tickets"
      searchParams={searchParams}
      emptyTitle="No tickets found"
      emptyDescription="Nothing matches this filter yet."
      getRowLabel={(r) => `ticket ${r.subject}`}
      renderExpanded={(r) => {
        const thread = messagesByTicket.get(r.id) ?? [];
        const publicAction = sendAdminTicketMessageAction.bind(null, r.id, false) as (
          state: EntityActionState,
          formData: FormData,
        ) => Promise<EntityActionState>;
        const internalAction = sendAdminTicketMessageAction.bind(null, r.id, true) as (
          state: EntityActionState,
          formData: FormData,
        ) => Promise<EntityActionState>;

        return (
          <div>
            <p className="mb-2 text-sm text-[var(--text-secondary)]">{r.description}</p>
            {thread.length > 0 && (
              <div className="flex flex-col gap-2">
                {thread.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-lg px-3 py-2 text-sm ${m.is_internal ? 'bg-warning-50 dark:bg-warning-700/20' : 'bg-[var(--surface-card)]'}`}
                  >
                    <p className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
                      {m.profiles?.full_name || 'Staff'} · {formatDateTime(m.created_at)}
                      {m.is_internal && <Badge tone="warning">Internal</Badge>}
                    </p>
                    <p className="mt-0.5 text-[var(--text-primary)]">{m.body}</p>
                  </div>
                ))}
              </div>
            )}
            <AdminTicketReplyForm publicAction={publicAction} internalAction={internalAction} />
          </div>
        );
      }}
    />
  );
}
