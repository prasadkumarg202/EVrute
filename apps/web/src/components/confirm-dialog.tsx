'use client';

/**
 * Confirmation dialog for destructive/irreversible actions — suspending a
 * station, processing a settlement payout, deleting a coupon.
 *
 * Built on the native `<dialog>` element: it gives us a real focus trap,
 * Escape-to-close and a labelled modal for free, instead of hand-rolling
 * one. `onConfirm` is awaited and the dialog only closes on success, so
 * there is never an optimistic "it worked" state ahead of the server.
 */

import { useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui';

export interface ConfirmDialogProps {
  readonly trigger: (open: () => void) => ReactNode;
  readonly title: string;
  readonly description: ReactNode;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly tone?: 'danger' | 'primary';
  readonly onConfirm: () => Promise<void> | void;
}

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const descId = useId();

  const open = () => {
    setError(null);
    dialogRef.current?.showModal();
  };

  const close = () => {
    if (pending) return;
    dialogRef.current?.close();
  };

  const handleConfirm = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      dialogRef.current?.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      {trigger(open)}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descId}
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-0 text-[var(--text-primary)] shadow-[var(--shadow-sheet)] backdrop:bg-ink-950/40 backdrop:backdrop-blur-[2px]"
      >
        <div className="p-5">
          <h2 id={titleId} className="font-display text-lg font-semibold text-[var(--text-primary)]">
            {title}
          </h2>
          <div id={descId} className="mt-2 text-sm text-[var(--text-secondary)]">
            {description}
          </div>
          {error && (
            <p role="alert" className="mt-3 text-sm font-medium text-danger-600">
              {error}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close} disabled={pending}>
              {cancelLabel}
            </Button>
            <Button
              type="button"
              variant={tone === 'danger' ? 'danger' : 'primary'}
              onClick={handleConfirm}
              loading={pending}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
