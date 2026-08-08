import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Badge, Card, CardBody } from '@/components/ui';
import { DataTable, DataTableSkeleton, type DataTableColumn } from '@/components/data-table';
import { requireRole, createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Audit log' };

const PAGE_SIZE = 25;

interface AuditRow {
  readonly id: number;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly actorName: string;
  readonly actorRole: string | null;
  readonly createdAt: string;
}

export default async function AdminAuditPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole('admin');
  const sp = await searchParams;
  const page = Math.max(Number(sp['page'] ?? '1') || 1, 1);
  const entity = typeof sp['entity'] === 'string' ? sp['entity'] : '';
  const actor = typeof sp['actor'] === 'string' ? sp['actor'] : '';
  const resolvedParams: Record<string, string | undefined> = {
    page: sp['page'] as string | undefined,
    entity: entity || undefined,
    actor: actor || undefined,
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--text-primary)]">Audit log</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Every privileged change made on the platform.</p>
      </div>

      <Card>
        <CardBody>
          <form className="grid grid-cols-1 gap-3 sm:grid-cols-3" method="get">
            <div>
              <label htmlFor="entity" className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                Entity type
              </label>
              <input
                id="entity"
                name="entity"
                defaultValue={entity}
                placeholder="e.g. stations"
                className="h-10 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-card)] px-2.5 text-sm text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label htmlFor="actor" className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                Actor name
              </label>
              <input
                id="actor"
                name="actor"
                defaultValue={actor}
                className="h-10 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-card)] px-2.5 text-sm text-[var(--text-primary)]"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="inline-flex h-10 items-center rounded-lg bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-text)] hover:bg-[var(--accent-hover)]"
              >
                Apply filters
              </button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Suspense key={`${page}-${entity}-${actor}`} fallback={<DataTableSkeleton columnCount={5} />}>
        <AuditTable page={page} entity={entity} actor={actor} searchParams={resolvedParams} />
      </Suspense>
    </div>
  );
}

async function AuditTable({
  page,
  entity,
  actor,
  searchParams,
}: {
  readonly page: number;
  readonly entity: string;
  readonly actor: string;
  readonly searchParams: Record<string, string | undefined>;
}) {
  const supabase = await createSupabaseServerClient();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('audit_log')
    .select('id, action, entity_type, entity_id, actor_role, created_at, profiles!audit_log_actor_id_fkey(full_name)', {
      count: 'exact',
    })
    .order('created_at', { ascending: false });

  if (entity) query = query.ilike('entity_type', `%${entity}%`);
  if (actor) {
    const { data: matchingActors } = await supabase.from('profiles').select('id').ilike('full_name', `%${actor}%`);
    const actorIds = (matchingActors ?? []).map((p) => p.id);
    // No matches: force an empty result rather than an unfiltered one.
    query = query.in('actor_id', actorIds.length > 0 ? actorIds : ['00000000-0000-0000-0000-000000000000']);
  }

  const { data, count, error } = await query.range(from, to);

  if (error || !data) {
    return (
      <DataTable<AuditRow>
        columns={columns}
        rows={[]}
        rowKey={(r) => String(r.id)}
        caption="Audit log"
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={0}
        basePath="/admin/audit"
        searchParams={searchParams}
        emptyTitle="Couldn't load the audit log"
        errorMessage={error?.message ?? 'Unknown error'}
      />
    );
  }

  const rows: AuditRow[] = data.map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    actorName: row.profiles?.full_name || 'System',
    actorRole: row.actor_role,
    createdAt: row.created_at,
  }));

  return (
    <DataTable<AuditRow>
      columns={columns}
      rows={rows}
      rowKey={(r) => String(r.id)}
      caption="Audit log"
      page={page}
      pageSize={PAGE_SIZE}
      totalCount={count ?? rows.length}
      basePath="/admin/audit"
      searchParams={searchParams}
      emptyTitle="No audit events found"
      emptyDescription="Try widening your filters."
    />
  );
}

const columns: readonly DataTableColumn<AuditRow>[] = [
  { key: 'action', header: 'Action', render: (r) => <span className="font-mono text-xs">{r.action}</span> },
  {
    key: 'entity',
    header: 'Entity',
    render: (r) => (
      <span>
        {r.entityType}
        {r.entityId && <span className="text-[var(--text-muted)]"> · {r.entityId.slice(0, 8)}</span>}
      </span>
    ),
  },
  { key: 'actor', header: 'Actor', render: (r) => r.actorName },
  {
    key: 'role',
    header: 'Role',
    render: (r) => (r.actorRole ? <Badge tone="neutral">{r.actorRole}</Badge> : '—'),
  },
  { key: 'when', header: 'When', render: (r) => formatDateTime(r.createdAt) },
];
