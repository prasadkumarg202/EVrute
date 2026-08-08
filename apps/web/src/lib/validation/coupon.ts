import { z } from 'zod';

/** Mirrors `public.coupons` check constraints in `0007_engagement.sql`. */

export const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{4,20}$/, 'Use 4-20 uppercase letters/numbers only'),
    title: z.string().trim().min(1, 'Title is required').max(120),
    description: z.string().trim().max(500).optional().or(z.literal('')),
    discountType: z.enum(['flat', 'percent']),
    value: z.coerce.number().gt(0, 'Must be greater than 0'),
    maxDiscount: z.coerce.number().gt(0).optional().or(z.literal('')),
    minOrder: z.coerce.number().min(0, 'Must be 0 or more').default(0),
    maxUses: z.coerce.number().int().gt(0).optional().or(z.literal('')),
    maxUsesPerUser: z.coerce.number().int('Must be a whole number').gt(0, 'Must be at least 1').default(1),
    stationId: z.string().uuid().optional().or(z.literal('')),
    validFrom: z.string().min(1, 'Choose a start date'),
    validTo: z.string().min(1, 'Choose an end date'),
    isActive: z.boolean().default(true),
  })
  .refine((data) => data.discountType !== 'percent' || data.value <= 100, {
    message: 'A percentage discount cannot exceed 100',
    path: ['value'],
  })
  .refine((data) => new Date(data.validTo) > new Date(data.validFrom), {
    message: 'End date must be after the start date',
    path: ['validTo'],
  });

export type CouponFormValues = z.infer<typeof couponSchema>;
