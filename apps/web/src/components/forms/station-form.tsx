'use client';

import { useActionState, useState } from 'react';
import { Button, Card, CardBody, CardHeader, CardTitle, Field } from '@/components/ui';
import { OWNER_SETTABLE_STATION_STATUS, STATION_AMENITIES } from '@/lib/validation/station';
import { presentStatus, STATION_STATUS } from '@evrute/core';
import { slugify } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { INITIAL_STATION_ACTION_STATE, type StationActionState } from '@/lib/validation/station';

export interface StationFormInitialValues {
  readonly name: string;
  readonly slug: string;
  readonly description: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly city: string;
  readonly state: string;
  readonly postalCode: string;
  readonly lat: string;
  readonly lng: string;
  readonly amenities: readonly string[];
  readonly is24x7: boolean;
  readonly openTime: string;
  readonly closeTime: string;
  readonly status: string;
}

export interface StationFormProps {
  readonly action: (state: StationActionState, formData: FormData) => Promise<StationActionState>;
  readonly initialValues: StationFormInitialValues;
  readonly submitLabel: string;
}

export function StationForm({ action, initialValues, submitLabel }: StationFormProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_STATION_ACTION_STATE);
  const [name, setName] = useState(initialValues.name);
  const [slug, setSlug] = useState(initialValues.slug);
  const [slugTouched, setSlugTouched] = useState(Boolean(initialValues.slug));
  const [is24x7, setIs24x7] = useState(initialValues.is24x7);
  const [amenities, setAmenities] = useState<readonly string[]>(initialValues.amenities);

  const errors = state.fieldErrors;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.formError && (
        <div role="alert" className="rounded-xl border border-danger-500/40 bg-danger-50 px-4 py-3 text-sm text-danger-700 dark:bg-danger-700/20 dark:text-danger-500">
          {state.formError}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Basics</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <Field
            label="Station name"
            name="name"
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
            {...(errors.name ? { error: errors.name } : {})}
          />
          <Field
            label="Slug"
            name="slug"
            required
            hint="Used in the station's public URL. Lowercase letters, numbers and hyphens only."
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            {...(errors.slug ? { error: errors.slug } : {})}
          />
          <div>
            <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={initialValues.description}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3 py-2.5 text-base text-[var(--text-primary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Location</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <Field
            label="Address line 1"
            name="addressLine1"
            required
            defaultValue={initialValues.addressLine1}
            {...(errors.addressLine1 ? { error: errors.addressLine1 } : {})}
          />
          <Field label="Address line 2" name="addressLine2" defaultValue={initialValues.addressLine2} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field
              label="City"
              name="city"
              required
              defaultValue={initialValues.city}
              {...(errors.city ? { error: errors.city } : {})}
            />
            <Field
              label="State"
              name="state"
              required
              defaultValue={initialValues.state}
              {...(errors.state ? { error: errors.state } : {})}
            />
            <Field
              label="Postal code"
              name="postalCode"
              required
              inputMode="numeric"
              maxLength={6}
              defaultValue={initialValues.postalCode}
              {...(errors.postalCode ? { error: errors.postalCode } : {})}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Latitude"
              name="lat"
              required
              type="number"
              step="0.000001"
              defaultValue={initialValues.lat}
              {...(errors.lat ? { error: errors.lat } : {})}
            />
            <Field
              label="Longitude"
              name="lng"
              required
              type="number"
              step="0.000001"
              defaultValue={initialValues.lng}
              {...(errors.lng ? { error: errors.lng } : {})}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hours &amp; amenities</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <label className="flex h-11 items-center gap-2.5 text-sm font-medium text-[var(--text-primary)]">
            <input
              type="checkbox"
              name="is24x7"
              checked={is24x7}
              onChange={(e) => setIs24x7(e.target.checked)}
              className="size-4 rounded border-[var(--border-strong)]"
            />
            Open 24x7
          </label>

          {!is24x7 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Opens at"
                name="openTime"
                type="time"
                defaultValue={initialValues.openTime}
                {...(errors.openTime ? { error: errors.openTime } : {})}
              />
              <Field label="Closes at" name="closeTime" type="time" defaultValue={initialValues.closeTime} />
            </div>
          )}

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-[var(--text-primary)]">Amenities</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {STATION_AMENITIES.map((a) => {
                const checked = amenities.includes(a.value);
                return (
                  <label key={a.value} className="flex h-10 items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      name="amenities"
                      value={a.value}
                      checked={checked}
                      onChange={(e) => {
                        setAmenities((prev) =>
                          e.target.checked ? [...prev, a.value] : prev.filter((v) => v !== a.value),
                        );
                      }}
                      className="size-4 rounded border-[var(--border-strong)]"
                    />
                    {a.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardBody>
          <label htmlFor="status" className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
            Station status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={initialValues.status}
            className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3 py-2.5 text-base text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {OWNER_SETTABLE_STATION_STATUS.map((s) => (
              <option key={s} value={s}>
                {presentStatus(STATION_STATUS, s).label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-[var(--text-muted)]">
            Suspending a station is an admin-only action and isn&apos;t available here.
          </p>
        </CardBody>
      </Card>

      <div className={cn('flex justify-end gap-3')}>
        <Button type="submit" loading={isPending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
