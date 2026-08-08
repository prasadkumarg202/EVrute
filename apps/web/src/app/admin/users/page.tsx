import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Card, CardBody } from '@/components/ui';
import { DataTable, DataTableSkeleton, type DataTableColumn } from '@/components/data-table';
import { RoleEditor } from '@/components/admin/role-editor';
import { requireRole, createSupabaseServerClient } from '@/lib/supabase/server';
import type { AppRole } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Users' };

const PAGE_SIZE = 20;

interface UserRow {
  readonly id: string;
  readonly fullName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly role: AppRole;
  readonly createdAt: string;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireRole('admin', 'employee');
  const sp = await searchParams;
  const page = Math.max(Number(sp['page'] ?? '1') || 1, 1);
  const q = typeof sp['q'] === 'string' ? sp['q'] : '';
  const resolvedParams: Record<string, string | undefined> = {
    page: sp['page'] as string | undefined,
    q: q || undefined,
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--text-primary)]">Users</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Everyone with an EVRute account.</p>
      </div>

      <Card>
        <CardBody>
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" method="get">
            <div className="flex-1">
              <label htmlFor="q" className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                Search name, phone or email
              </label>
              <input
                id="q"
                name="q"
                defaultValue={q}
                className="h-10 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-card)] px-2.5 text-sm text-[var(--text-primary)]"
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-10 items-center rounded-lg bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-text)] hover:bg-[var(--accent-hover)]"
            >
              Search
            </button>
          </form>
        </CardBody>
      </Card>

      <Suspense key={`${page}-${q}`} fallback={<DataTableSkeleton columnCount={5} />}>
        <UsersTable page={page} q={q} searchParams={resolvedParams} selfId={admin.id} />
      </Suspense>
    </div>
  );
}

async function UsersTable({
  page,
  q,
  searchParams,
  selfId,
}: {
  readonly page: number;
  readonly q: string;
  readonly searchParams: Record<string, string | undefined>;
  readonly selfId: string;
}) {
  const supabase = await createSupabaseServerClient();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('profiles')
    .select('id, full_name, email, phone, role, created_at', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);

  const { data, count, error } = await query.range(from, to);

  const columns: readonly DataTableColumn<UserRow>[] = [
    { key: 'name', header: 'Name', render: (r) => r.fullName || '—' },
    { key: 'email', header: 'Email', render: (r) => r.email ?? '—' },
    { key: 'phone', header: 'Phone', render: (r) => r.phone ?? '—' },
    { key: 'joined', header: 'Joined', render: (r) => formatDate(r.createdAt) },
    {
      key: 'role',
      header: 'Role',
      render: (r) => <RoleEditor userId={r.id} currentRole={r.role} isSelf={r.id === selfId} />,
    },
  ];

  if (error || !data) {
    return (
      <DataTable<UserRow>
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        caption="Users"
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={0}
        basePath="/admin/users"
        searchParams={searchParams}
        emptyTitle="Couldn't load users"
        errorMessage={error?.message ?? 'Unknown error'}
      />
    );
  }

  const rows: UserRow[] = data.map((u) => ({
    id: u.id,
    fullName: u.full_name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    createdAt: u.created_at,
  }));

  return (
    <DataTable<UserRow>
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      caption="Users"
      page={page}
      pageSize={PAGE_SIZE}
      totalCount={count ?? rows.length}
      basePath="/admin/users"
      searchParams={searchParams}
      emptyTitle="No users found"
      emptyDescription="Try a different search."
    />
  );
}
