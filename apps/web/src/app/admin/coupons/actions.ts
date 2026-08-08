'use server';

import { revalidatePath } from 'next/cache';
import { couponSchema } from '@/lib/validation/coupon';
import { requireRole, createSupabaseServerClient } from '@/lib/supabase/server';
import { fieldErrorsFromIssues, type EntityActionState } from '@/lib/entity-action-state';

function parseForm(formData: FormData) {
  return couponSchema.safeParse({
    code: formData.get('code'),
    title: formData.get('title'),
    description: formData.get('description'),
    discountType: formData.get('discountType'),
    value: formData.get('value'),
    maxDiscount: formData.get('maxDiscount'),
    minOrder: formData.get('minOrder'),
    maxUses: formData.get('maxUses'),
    maxUsesPerUser: formData.get('maxUsesPerUser'),
    stationId: formData.get('stationId'),
    validFrom: formData.get('validFrom'),
    validTo: formData.get('validTo'),
    isActive: formData.get('isActive') === 'on',
  });
}

export async function saveCouponAction(
  couponId: string | null,
  _prevState: EntityActionState,
  formData: FormData,
): Promise<EntityActionState> {
  const admin = await requireRole('admin');
  const parsed = parseForm(formData);

  if (!parsed.success) {
    return { status: 'error', fieldErrors: fieldErrorsFromIssues(parsed.error.issues) };
  }

  const v = parsed.data;
  const supabase = await createSupabaseServerClient();
  const payload = {
    code: v.code,
    title: v.title,
    description: v.description || null,
    discount_type: v.discountType,
    value: v.value,
    max_discount: v.maxDiscount === '' || v.maxDiscount === undefined ? null : v.maxDiscount,
    min_order: v.minOrder,
    max_uses: v.maxUses === '' || v.maxUses === undefined ? null : v.maxUses,
    max_uses_per_user: v.maxUsesPerUser,
    station_id: v.stationId || null,
    valid_from: new Date(v.validFrom).toISOString(),
    valid_to: new Date(v.validTo).toISOString(),
    is_active: v.isActive,
  };

  const { error } = couponId
    ? await supabase.from('coupons').update(payload).eq('id', couponId)
    : await supabase.from('coupons').insert({ ...payload, created_by: admin.id });

  if (error) {
    if (error.code === '23505') {
      return { status: 'error', fieldErrors: { code: 'A coupon with this code already exists.' } };
    }
    return { status: 'error', fieldErrors: {}, formError: error.message };
  }

  revalidatePath('/admin/coupons');
  return { status: 'success', fieldErrors: {} };
}

export interface SimpleActionResult {
  readonly ok: boolean;
  readonly error?: string;
}

export async function deleteCouponAction(couponId: string): Promise<SimpleActionResult> {
  await requireRole('admin');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('coupons').delete().eq('id', couponId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/coupons');
  return { ok: true };
}
