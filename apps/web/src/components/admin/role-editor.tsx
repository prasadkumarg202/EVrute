'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import { setUserRoleAction } from '@/app/admin/users/actions';
import type { AppRole } from '@/lib/supabase/server';

const ROLES: readonly AppRole[] = ['customer', 'owner', 'admin', 'employee'];

export function RoleEditor({
  userId,
  currentRole,
  isSelf,
}: {
  readonly userId: string;
  readonly currentRole: AppRole;
  readonly isSelf: boolean;
}) {
  const [role, setRole] = useState<AppRole>(currentRole);
  const [isPending, startTransition] = useTransition();
  const { push } = useToast();
  const router = useRouter();

  if (isSelf) {
    return <span className="text-sm text-[var(--text-muted)]">{currentRole} (you)</span>;
  }

  const dirty = role !== currentRole;

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Role"
        value={role}
        disabled={isPending}
        onChange={(e) => setRole(e.target.value as AppRole)}
        className="h-9 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-card)] px-2 text-sm text-[var(--text-primary)]"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      {dirty && (
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await setUserRoleAction(userId, role);
              if (!result.ok) {
                push({ tone: 'danger', title: 'Could not change role', ...(result.error ? { description: result.error } : {}) });
                setRole(currentRole);
                return;
              }
              push({ tone: 'success', title: 'Role updated' });
              router.refresh();
            })
          }
          className="inline-flex h-9 items-center rounded-lg bg-[var(--accent)] px-3 text-xs font-medium text-[var(--accent-text)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          Save
        </button>
      )}
    </div>
  );
}
