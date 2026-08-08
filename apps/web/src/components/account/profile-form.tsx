'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button, Field } from '@/components/ui/index';
import { updateProfileAction, type ProfileFormState } from '@/lib/actions/auth';

const INITIAL: ProfileFormState = { status: 'idle' };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      Save changes
    </Button>
  );
}

export function ProfileForm({
  fullName,
  email,
  phone,
}: {
  readonly fullName: string;
  readonly email: string | null;
  readonly phone: string | null;
}) {
  const [state, formAction] = useActionState(updateProfileAction, INITIAL);

  return (
    <form action={formAction} className="space-y-4">
      <Field
        label="Name"
        name="full_name"
        defaultValue={fullName}
        maxLength={80}
        autoComplete="name"
        {...(state.status === 'error' && state.field === 'full_name'
          ? { error: state.message }
          : {})}
      />

      {/* Email and phone are owned by Supabase Auth — changing either needs a
          verification round trip, not a profile UPDATE. Shown read-only rather
          than offered as an editable field that would silently fail. */}
      <div className="grid gap-1.5">
        <span className="text-sm font-medium text-[var(--text-primary)]">Email</span>
        <p className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 py-2.5 text-sm text-[var(--text-secondary)]">
          {email ?? 'Not set'}
        </p>
      </div>

      <div className="grid gap-1.5">
        <span className="text-sm font-medium text-[var(--text-primary)]">Phone</span>
        <p className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 py-2.5 text-sm text-[var(--text-secondary)]">
          {phone ?? 'Not set'}
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          Email and phone changes need verification — contact support to update them.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <SaveButton />
        {state.status === 'success' && (
          <p role="status" className="text-sm font-medium text-success-600">
            Saved
          </p>
        )}
        {state.status === 'error' && !state.field && (
          <p role="alert" className="text-sm font-medium text-danger-600">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
