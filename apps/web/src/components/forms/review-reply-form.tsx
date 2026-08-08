'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { INITIAL_ENTITY_STATE, type EntityActionState } from '@/lib/entity-action-state';

type ReplyAction = (state: EntityActionState, formData: FormData) => Promise<EntityActionState>;

export function ReviewReplyForm({ action, existingReply }: { readonly action: ReplyAction; readonly existingReply: string | null }) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ENTITY_STATE);
  const [editing, setEditing] = useState(false);
  const { push } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') {
      push({ tone: 'success', title: 'Reply sent' });
      router.refresh();
      setEditing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (existingReply && !editing) {
    return (
      <div className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3">
        <p className="text-xs font-medium text-[var(--text-secondary)]">Your reply</p>
        <p className="mt-1 text-sm text-[var(--text-primary)]">{existingReply}</p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-2 text-xs font-medium text-[var(--accent)] hover:underline"
        >
          Edit reply
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2">
      <label htmlFor={`reply-${existingReply ?? 'new'}`} className="sr-only">
        Reply to review
      </label>
      <textarea
        id={`reply-${existingReply ?? 'new'}`}
        name="reply"
        rows={2}
        defaultValue={existingReply ?? ''}
        placeholder="Write a public reply…"
        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      />
      {state.fieldErrors.reply && (
        <p role="alert" className="text-xs font-medium text-danger-600">
          {state.fieldErrors.reply}
        </p>
      )}
      {state.formError && (
        <p role="alert" className="text-xs font-medium text-danger-600">
          {state.formError}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={isPending}>
          Send reply
        </Button>
        {existingReply && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
