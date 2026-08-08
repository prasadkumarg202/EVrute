import { z } from 'zod';

/**
 * Station create/edit validation. Mirrors the `public.stations` check
 * constraints in `0003_assets.sql` exactly, so a form that passes here
 * cannot fail at the database with an opaque constraint-violation error.
 */

export const STATION_AMENITIES = [
  { value: 'parking', label: 'Parking' },
  { value: 'restroom', label: 'Restroom' },
  { value: 'cafe', label: 'Cafe' },
  { value: 'wifi', label: 'Wi-Fi' },
  { value: 'cctv', label: 'CCTV' },
  { value: 'security_guard', label: 'Security guard' },
  { value: 'waiting_lounge', label: 'Waiting lounge' },
  { value: 'wheelchair_accessible', label: 'Wheelchair accessible' },
  { value: 'convenience_store', label: 'Convenience store' },
  { value: 'ev_accessories', label: 'EV accessories' },
] as const;

/** Statuses an owner may set directly. `suspended` is an admin-only, punitive action. */
export const OWNER_SETTABLE_STATION_STATUS = ['draft', 'under_review', 'active', 'maintenance'] as const;

const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM format');

export const stationSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(120, 'Name must be at most 120 characters'),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens only'),
    description: z.string().trim().max(2000).optional().or(z.literal('')),
    addressLine1: z.string().trim().min(1, 'Address is required'),
    addressLine2: z.string().trim().max(200).optional().or(z.literal('')),
    city: z.string().trim().min(1, 'City is required'),
    state: z.string().trim().min(1, 'State is required'),
    postalCode: z
      .string()
      .trim()
      .regex(/^[0-9]{6}$/, 'Enter a valid 6-digit postal code'),
    lat: z.coerce.number().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90'),
    lng: z.coerce.number().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180'),
    amenities: z.array(z.string()).default([]),
    is24x7: z.boolean().default(true),
    openTime: timeString.optional().or(z.literal('')),
    closeTime: timeString.optional().or(z.literal('')),
    status: z.enum(OWNER_SETTABLE_STATION_STATUS),
  })
  .refine((data) => data.is24x7 || (data.openTime && data.closeTime), {
    message: 'Set opening and closing times, or mark the station 24x7',
    path: ['openTime'],
  });

export type StationFormValues = z.infer<typeof stationSchema>;

export type StationFieldErrors = Partial<Record<keyof StationFormValues, string>>;

export interface StationActionState {
  readonly status: 'idle' | 'error';
  readonly fieldErrors: StationFieldErrors;
  readonly formError?: string;
}

export const INITIAL_STATION_ACTION_STATE: StationActionState = { status: 'idle', fieldErrors: {} };
