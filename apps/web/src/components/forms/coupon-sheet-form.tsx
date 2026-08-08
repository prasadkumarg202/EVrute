'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Sheet } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { INITIAL_ENTITY_STATE, type EntityActionState } from '@/lib/entity-action-state';
import { toDateInputValue } from '@/lib/utils/format';

type CouponAction = (state: EntityActionState, formData: FormData) => Promise<EntityActionState>;

export interface CouponFormDefaults {
  readonly code: string;
  readonly title: string;
  readonly description: string;
  readonly discountType: 'flat' | 'percent';
  readonly value: string;
  readonly maxDiscount: string;
  readonly minOrder: string;
  readonly maxUses: string;
  readonly maxUsesPerUser: string;
  readonly stationId: string;
  readonly validFrom: string;
  readonly validTo: string;
  readonly isActive: boolean;
}

export function CouponSheetTrigger({
  action,
  triggerLabel,
  title,
  defaultValues,
  stationOptions,
  triggerVariant = 'primary',
  triggerSize = 'md',
}: {
  readonly action: CouponAction;
  readonly triggerLabel: string;
  readonly title: string;
  readonly defaultValues: CouponFormDefaults;
  readonly stationOptions: readonly { id: string; name: string }[];
  readonly triggerVariant?: 'primary' | 'secondary';
  readonly triggerSize?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(action, INITIAL_ENTITY_STATE);
  const { push } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') {
      push({ tone: 'success', title: 'Coupon saved' });
      router.refresh();
      setOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <>
      <Button type="button" variant={triggerVariant} size={triggerSize} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <form action={formAction} className="flex flex-col gap-4">
          {state.formError && (
            <p role="alert" className="text-sm font-medium text-danger-600">
              {state.formError}
            </p>
          )}
          <Field
            label="Code"
            name="code"
            required
            defaultValue={defaultValues.code}
            hint="4-20 uppercase letters/numbers"
            {...(state.fieldErrors.code ? { error: state.fieldErrors.code } : {})}
          />
          <Field
            label="Title"
            name="title"
            required
            defaultValue={defaultValues.title}
            {...(state.fieldErrors.title ? { error: state.fieldErrors.title } : {})}
          />
          <div>
            <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={defaultValues.description}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3 py-2.5 text-base text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            />
          </div>
          <div>
            <label htmlFor="discountType" className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
              Discount type
            </label>
            <select
              id="discountType"
              name="discountType"
              defaultValue={defaultValues.discountType}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3 py-2.5 text-base text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <option value="flat">Flat (₹)</option>
              <option value="percent">Percent (%)</option>
            </select>
          </div>
          <Field
            label="Value"
            name="value"
            type="number"
            step="0.01"
            required
            defaultValue={defaultValues.value}
            {...(state.fieldErrors.value ? { error: state.fieldErrors.value } : {})}
          />
          <Field label="Max discount (₹, optional)" name="maxDiscount" type="number" step="0.01" defaultValue={defaultValues.maxDiscount} />
          <Field label="Minimum order (₹)" name="minOrder" type="number" step="0.01" defaultValue={defaultValues.minOrder} />
          <Field label="Max total uses (optional)" name="maxUses" type="number" defaultValue={defaultValues.maxUses} />
          <Field
            label="Max uses per user"
            name="maxUsesPerUser"
            type="number"
            defaultValue={defaultValues.maxUsesPerUser}
            {...(state.fieldErrors.maxUsesPerUser ? { error: state.fieldErrors.maxUsesPerUser } : {})}
          />
          <div>
            <label htmlFor="stationId" className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
              Limit to a station (optional)
            </label>
            <select
              id="stationId"
              name="stationId"
              defaultValue={defaultValues.stationId}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3 py-2.5 text-base text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <option value="">All stations</option>
              {stationOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <Field
            label="Valid from"
            name="validFrom"
            type="date"
            required
            defaultValue={defaultValues.validFrom || toDateInputValue(new Date())}
            {...(state.fieldErrors.validFrom ? { error: state.fieldErrors.validFrom } : {})}
          />
          <Field
            label="Valid to"
            name="validTo"
            type="date"
            required
            defaultValue={defaultValues.validTo}
            {...(state.fieldErrors.validTo ? { error: state.fieldErrors.validTo } : {})}
          />
          <label className="flex h-11 items-center gap-2.5 text-sm font-medium text-[var(--text-primary)]">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={defaultValues.isActive}
              className="size-4 rounded border-[var(--border-strong)]"
            />
            Active
          </label>
          <Button type="submit" loading={isPending} fullWidth>
            Save coupon
          </Button>
        </form>
      </Sheet>
    </>
  );
}
