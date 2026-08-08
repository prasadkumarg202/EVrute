'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { deleteCouponAction } from '@/app/admin/coupons/actions';

export function CouponDeleteAction({ couponId, code }: { readonly couponId: string; readonly code: string }) {
  const router = useRouter();
  const { push } = useToast();

  return (
    <ConfirmDialog
      trigger={(open) => (
        <Button type="button" variant="danger" size="sm" onClick={open}>
          Delete
        </Button>
      )}
      title={`Delete coupon ${code}?`}
      description="This permanently removes the coupon. Past redemptions are kept for records, but the code will stop working immediately."
      confirmLabel="Delete coupon"
      tone="danger"
      onConfirm={async () => {
        const result = await deleteCouponAction(couponId);
        if (!result.ok) throw new Error(result.error ?? 'Could not delete the coupon.');
        push({ tone: 'success', title: 'Coupon deleted' });
        router.refresh();
      }}
    />
  );
}
