import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Badge } from '@/components/ui';
import { DataTable, DataTableSkeleton, type DataTableColumn } from '@/components/data-table';
import { CouponSheetTrigger } from '@/components/forms/coupon-sheet-form';
import { CouponDeleteAction } from '@/components/admin/coupon-delete-action';
import { saveCouponAction } from './actions';
import { formatINR } from '@evrute/core';
import { requireRole, createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils/format';
import type { EntityActionState } from '@/lib/entity-action-state';
import type { Database } from '@evrute/db/types';

type CouponFullRow = Database['public']['Tables']['coupons']['Row'];

export const metadata: Metadata = { title: 'Coupons' };

const PAGE_SIZE = 20;

interface CouponRow {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly discountType: 'flat' | 'percent';
  readonly value: number;
  readonly usedCount: number;
  readonly maxUses: number | null;
  readonly validTo: string;
  readonly isActive: boolean;
}

export default async function AdminCouponsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole('admin', 'employee');
  const sp = await searchParams;
  const page = Math.max(Number(sp['page'] ?? '1') || 1, 1);
  const resolvedParams: Record<string, string | undefined> = { page: sp['page'] as string | undefined };

  const supabase = await createSupabaseServerClient();
  const { data: stations } = await supabase.from('stations').select('id, name').order('name');

  const boundCreate = saveCouponAction.bind(null, null) as (
    state: EntityActionState,
    formData: FormData,
  ) => Promise<EntityActionState>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[var(--text-primary)]">Coupons</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Discount codes for the customer app.</p>
        </div>
        <CouponSheetTrigger
          action={boundCreate}
          title="Add coupon"
          triggerLabel="Add coupon"
          stationOptions={stations ?? []}
          defaultValues={{
            code: '',
            title: '',
            description: '',
            discountType: 'flat',
            value: '',
            maxDiscount: '',
            minOrder: '0',
            maxUses: '',
            maxUsesPerUser: '1',
            stationId: '',
            validFrom: '',
            validTo: '',
            isActive: true,
          }}
        />
      </div>

      <Suspense key={page} fallback={<DataTableSkeleton columnCount={6} />}>
        <CouponsTable page={page} searchParams={resolvedParams} stations={stations ?? []} />
      </Suspense>
    </div>
  );
}

async function CouponsTable({
  page,
  searchParams,
  stations,
}: {
  readonly page: number;
  readonly searchParams: Record<string, string | undefined>;
  readonly stations: readonly { id: string; name: string }[];
}) {
  const supabase = await createSupabaseServerClient();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, count, error } = await supabase
    .from('coupons')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error || !data) {
    return (
      <DataTable<CouponRow>
        columns={columns(stations)}
        rows={[]}
        rowKey={(r) => r.id}
        caption="Coupons"
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={0}
        basePath="/admin/coupons"
        searchParams={searchParams}
        emptyTitle="Couldn't load coupons"
        errorMessage={error?.message ?? 'Unknown error'}
      />
    );
  }

  const rowsById = new Map(data.map((c) => [c.id, c]));
  const rows: CouponRow[] = data.map((c) => ({
    id: c.id,
    code: c.code,
    title: c.title,
    discountType: c.discount_type,
    value: c.value,
    usedCount: c.used_count,
    maxUses: c.max_uses,
    validTo: c.valid_to,
    isActive: c.is_active,
  }));

  return (
    <DataTable<CouponRow>
      columns={columns(stations, rowsById)}
      rows={rows}
      rowKey={(r) => r.id}
      caption="Coupons"
      page={page}
      pageSize={PAGE_SIZE}
      totalCount={count ?? rows.length}
      basePath="/admin/coupons"
      searchParams={searchParams}
      emptyTitle="No coupons yet"
      emptyDescription="Add your first discount code."
    />
  );
}

function columns(
  stations: readonly { id: string; name: string }[],
  rowsById?: Map<string, CouponFullRow>,
): readonly DataTableColumn<CouponRow>[] {
  return [
    { key: 'code', header: 'Code', render: (r) => <span className="font-mono font-medium">{r.code}</span> },
    { key: 'title', header: 'Title', render: (r) => r.title },
    {
      key: 'discount',
      header: 'Discount',
      render: (r) => (r.discountType === 'flat' ? formatINR(r.value) : `${r.value}%`),
    },
    { key: 'used', header: 'Used', render: (r) => `${r.usedCount}${r.maxUses ? ` / ${r.maxUses}` : ''}` },
    { key: 'validTo', header: 'Expires', render: (r) => formatDate(r.validTo) },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (r.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => {
        const full = rowsById?.get(r.id);
        const boundEdit = saveCouponAction.bind(null, r.id) as (
          state: EntityActionState,
          formData: FormData,
        ) => Promise<EntityActionState>;
        return (
          <div className="flex items-center gap-2">
            <CouponSheetTrigger
              action={boundEdit}
              title="Edit coupon"
              triggerLabel="Edit"
              triggerVariant="secondary"
              triggerSize="sm"
              stationOptions={stations}
              defaultValues={{
                code: full?.code ?? r.code,
                title: full?.title ?? r.title,
                description: full?.description ?? '',
                discountType: full?.discount_type ?? r.discountType,
                value: String(full?.value ?? r.value),
                maxDiscount: full?.max_discount != null ? String(full.max_discount) : '',
                minOrder: String(full?.min_order ?? 0),
                maxUses: full?.max_uses != null ? String(full.max_uses) : '',
                maxUsesPerUser: String(full?.max_uses_per_user ?? 1),
                stationId: full?.station_id ?? '',
                validFrom: full?.valid_from ? full.valid_from.slice(0, 10) : '',
                validTo: full?.valid_to ? full.valid_to.slice(0, 10) : r.validTo.slice(0, 10),
                isActive: full?.is_active ?? r.isActive,
              }}
            />
            <CouponDeleteAction couponId={r.id} code={r.code} />
          </div>
        );
      },
    },
  ];
}
