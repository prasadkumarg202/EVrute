'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import type { StatusTone } from '@evrute/core';

/**
 * Toasts.
 *
 * The live region is `polite` for success and `assertive` for errors: a
 * failed payment should interrupt a screen reader, a "copied" confirmation
 * should not. Errors also persist until dismissed, because a toast that
 * disappears after 4 seconds is not an acceptable way to report that money
 * did not move.
 */

export interface Toast {
  readonly id: string;
  readonly tone: StatusTone;
  readonly title: string;
  readonly description?: string;
}

interface ToastContextValue {
  readonly toasts: readonly Toast[];
  push(toast: Omit<Toast, 'id'> & { readonly durationMs?: number }): string;
  dismiss(id: string): void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<StatusTone, string> = {
  success: 'border-success-500/40 bg-success-50 text-success-700 dark:bg-success-700/20 dark:text-success-500',
  warning: 'border-warning-500/40 bg-warning-50 text-warning-700 dark:bg-warning-700/20 dark:text-warning-500',
  danger: 'border-danger-500/40 bg-danger-50 text-danger-700 dark:bg-danger-700/20 dark:text-danger-500',
  info: 'border-info-500/40 bg-info-50 text-info-700 dark:bg-info-700/20 dark:text-info-500',
  neutral: 'border-[var(--border-strong)] bg-[var(--surface-card)] text-[var(--text-primary)]',
};

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback<ToastContextValue['push']>(
    ({ durationMs, ...toast }) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((current) => [...current, { ...toast, id }]);

      // Errors stay until dismissed; everything else auto-clears.
      const timeout = durationMs ?? (toast.tone === 'danger' ? 0 : 4500);
      if (timeout > 0) {
        setTimeout(() => dismiss(id), timeout);
      }
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] sm:pb-6"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === 'danger' ? 'alert' : 'status'}
            aria-live={toast.tone === 'danger' ? 'assertive' : 'polite'}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-lg',
              TONE_STYLES[toast.tone],
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{toast.title}</p>
              {toast.description && <p className="mt-0.5 text-xs opacity-90">{toast.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className="-mr-1 -mt-1 rounded-lg p-1 opacity-70 hover:opacity-100"
            >
              <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden="true">
                <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
