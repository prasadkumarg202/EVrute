'use client';

import { useActionState, useEffect, useId, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { INITIAL_ENTITY_STATE, type EntityActionState } from '@/lib/entity-action-state';

type ReplyAction = (state: EntityActionState, formData: FormData) => Promise<EntityActionState>;

export function TicketReplyForm({ action }: { readonly action: ReplyAction }) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ENTITY_STATE);
  const { push } = useToast();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fieldId = useId();

  useEffect(() => {
    if (state.status === 'success') {
      push({ tone: 'success', title: 'Message sent' });
      formRef.current?.reset();
      router.refresh();
    } else if (state.status === 'error' && state.formError) {
      push({ tone: 'danger', title: 'Could not send message', description: state.formError });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="mt-3 flex flex-col gap-2">
      <label htmlFor={fieldId} className="sr-only">
        Reply
      </label>
      <textarea
        id={fieldId}
        name="body"
        rows={2}
        placeholder="Write a reply…"
        className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      />
      {state.fieldErrors.body && (
        <p role="alert" className="text-xs font-medium text-danger-600">
          {state.fieldErrors.body}
        </p>
      )}
      <div>
        <Button type="submit" size="sm" loading={isPending}>
          Send reply
        </Button>
      </div>
    </form>
  );
}
