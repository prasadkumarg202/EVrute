'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { INITIAL_ENTITY_STATE, type EntityActionState } from '@/lib/entity-action-state';

type ReplyAction = (state: EntityActionState, formData: FormData) => Promise<EntityActionState>;

export function AdminTicketReplyForm({
  publicAction,
  internalAction,
}: {
  readonly publicAction: ReplyAction;
  readonly internalAction: ReplyAction;
}) {
  const [isInternal, setIsInternal] = useState(false);
  const action = isInternal ? internalAction : publicAction;
  const [state, formAction, isPending] = useActionState(action, INITIAL_ENTITY_STATE);
  const { push } = useToast();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fieldId = useId();
  const checkboxId = useId();

  useEffect(() => {
    if (state.status === 'success') {
      push({ tone: 'success', title: isInternal ? 'Internal note added' : 'Reply sent' });
      formRef.current?.reset();
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="mt-3 flex flex-col gap-2">
      <label htmlFor={fieldId} className="sr-only">
        Message
      </label>
      <textarea
        id={fieldId}
        name="body"
        rows={2}
        placeholder={isInternal ? 'Internal note (staff only)…' : 'Reply to the customer…'}
        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      />
      {state.fieldErrors.body && (
        <p role="alert" className="text-xs font-medium text-danger-600">
          {state.fieldErrors.body}
        </p>
      )}
      {state.formError && (
        <p role="alert" className="text-xs font-medium text-danger-600">
          {state.formError}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={checkboxId} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <input
            id={checkboxId}
            type="checkbox"
            checked={isInternal}
            onChange={(e) => setIsInternal(e.target.checked)}
            className="size-3.5 rounded border-[var(--border-strong)]"
          />
          Internal note (not visible to the customer)
        </label>
        <Button type="submit" size="sm" loading={isPending}>
          {isInternal ? 'Add note' : 'Send reply'}
        </Button>
      </div>
    </form>
  );
}
