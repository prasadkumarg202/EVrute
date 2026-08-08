/**
 * EVRute UI primitives.
 *
 * One file rather than twenty, deliberately: these are small, they change
 * together, and every screen in all three surfaces imports from here. That
 * is what keeps the customer PWA, owner portal and admin panel visually
 * identical without a shared-component review process.
 *
 * Rules encoded here rather than left to each screen:
 *  - status is never colour-only (WCAG 1.4.1)
 *  - loading is a skeleton with the shape of the real content, not a spinner
 *  - destructive actions require confirmation
 *  - every interactive element has a visible focus ring and a 44px hit area
 */

import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import type { StatusTone } from '@evrute/core';

/* ------------------------------------------------------------------ Button */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--accent-hover)] shadow-sm',
  secondary:
    'bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-strong)] hover:bg-[var(--surface-sunken)]',
  ghost: 'text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]',
  danger: 'bg-danger-600 text-white hover:bg-danger-700 shadow-sm',
  success: 'bg-success-600 text-white hover:bg-success-700 shadow-sm',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
  lg: 'h-13 px-6 text-base gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly loading?: boolean;
  readonly fullWidth?: boolean;
  readonly icon?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  icon,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      // A loading button stays disabled: double-submitting "Start charging"
      // is a second physical charge, not a duplicate form post.
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-xl font-medium',
        'transition-colors duration-150',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
}

export function Spinner({ className }: { readonly className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------- Card */

export function Card({
  className,
  as: Tag = 'div',
  ...props
}: HTMLAttributes<HTMLElement> & { readonly as?: 'div' | 'section' | 'article' | 'li' }) {
  // `Tag` is a union of intrinsic elements whose prop types differ only in
  // their event-handler element parameter. React accepts the shared
  // HTMLAttributes at runtime; the cast keeps the polymorphic API without
  // widening every consumer to `any`.
  const Component = Tag as 'div';
  return (
    <Component
      {...props}
      className={cn(
        'rounded-[var(--radius-card)] bg-[var(--surface-card)]',
        'border border-[var(--border-subtle)] shadow-[var(--shadow-card)]',
        className,
      )}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn('px-4 pt-4 pb-2 sm:px-5 sm:pt-5', className)} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn('px-4 pb-4 sm:px-5 sm:pb-5', className)} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      {...props}
      className={cn('font-display text-base font-semibold text-[var(--text-primary)]', className)}
    />
  );
}

/* ------------------------------------------------------------------- Badge */

const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-success-50 text-success-700 ring-success-500/25 dark:bg-success-700/20 dark:text-success-500',
  warning: 'bg-warning-50 text-warning-700 ring-warning-500/25 dark:bg-warning-700/20 dark:text-warning-500',
  danger: 'bg-danger-50 text-danger-700 ring-danger-500/25 dark:bg-danger-700/20 dark:text-danger-500',
  info: 'bg-info-50 text-info-700 ring-info-500/25 dark:bg-info-700/20 dark:text-info-500',
  neutral: 'bg-ink-100 text-ink-700 ring-ink-400/25 dark:bg-ink-800 dark:text-ink-300',
};

const TONE_DOTS: Record<StatusTone, string> = {
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
  info: 'bg-info-500',
  neutral: 'bg-ink-400',
};

export interface BadgeProps {
  readonly tone?: StatusTone;
  readonly children: ReactNode;
  /** Screen-reader-only elaboration, e.g. "Connector is free to use". */
  readonly srHint?: string;
  readonly dot?: boolean;
  readonly pulse?: boolean;
  readonly className?: string;
}

/**
 * Status badge. Always renders a text label alongside the colour — the
 * handoff spec calls this out for connector status specifically, and it is
 * the same rule for settlement and payment states.
 */
export function Badge({ tone = 'neutral', children, srHint, dot = true, pulse, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1',
        'text-xs font-medium ring-1 ring-inset whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cn('size-1.5 rounded-full', TONE_DOTS[tone], pulse && 'animate-charge')}
        />
      )}
      {children}
      {srHint && <span className="sr-only"> — {srHint}</span>}
    </span>
  );
}

/* ---------------------------------------------------------------- Skeleton */

export function Skeleton({ className }: { readonly className?: string }) {
  return <div aria-hidden="true" className={cn('skeleton rounded-lg', className)} />;
}

/**
 * Wrapper that announces loading to assistive tech while showing skeletons.
 * A visual-only skeleton leaves screen-reader users with silence.
 */
export function LoadingRegion({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------- EmptyState */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  readonly icon?: ReactNode;
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {icon && (
        <div
          aria-hidden="true"
          className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] text-[var(--text-muted)]"
        >
          {icon}
        </div>
      )}
      <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-[var(--text-secondary)]">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------- ErrorState */

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  className,
}: {
  readonly title?: string;
  readonly description?: string;
  readonly onRetry?: () => void;
  readonly className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}
    >
      <div
        aria-hidden="true"
        className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-danger-50 text-danger-600 dark:bg-danger-700/20"
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-7">
          <path
            d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-[var(--text-secondary)]">{description}</p>
      )}
      {onRetry && (
        <Button variant="secondary" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- Input */

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string;
  readonly prefix?: string;
}

/**
 * Labelled input. The label is a real <label>, the hint and error are wired
 * through aria-describedby, and the error is announced. Placeholder text is
 * never used as a label — it disappears the moment someone types.
 */
export function Field({ label, hint, error, prefix, id, className, ...props }: FieldProps) {
  const inputId = id ?? `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="w-full">
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
        {label}
        {props.required && (
          <span className="ml-0.5 text-danger-600" aria-hidden="true">
            *
          </span>
        )}
      </label>

      <div className="relative">
        {prefix && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-[var(--text-muted)]"
          >
            {prefix}
          </span>
        )}
        <input
          {...props}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(hintId, errorId) || undefined}
          className={cn(
            'w-full rounded-xl border bg-[var(--surface-card)] px-3 py-2.5',
            // 16px minimum: anything smaller makes iOS Safari zoom on focus.
            'text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
            'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
            'disabled:cursor-not-allowed disabled:opacity-60',
            error
              ? 'border-danger-500 focus-visible:ring-danger-500'
              : 'border-[var(--border-strong)]',
            prefix && 'pl-8',
            className,
          )}
        />
      </div>

      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-[var(--text-muted)]">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs font-medium text-danger-600">
          {error}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- Stat */

export function Stat({
  label,
  value,
  sublabel,
  tone,
  loading,
}: {
  readonly label: string;
  readonly value: string;
  readonly sublabel?: string;
  readonly tone?: StatusTone;
  readonly loading?: boolean;
}) {
  if (loading) {
    return (
      <Card className="p-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-2.5 h-7 w-28" />
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <p className="text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">{label}</p>
      <p
        className={cn(
          'tabular mt-1.5 font-display text-2xl font-semibold',
          tone === 'success' && 'text-success-600',
          tone === 'danger' && 'text-danger-600',
          !tone && 'text-[var(--text-primary)]',
        )}
      >
        {value}
      </p>
      {sublabel && <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{sublabel}</p>}
    </Card>
  );
}

/* ------------------------------------------------------------------ Sheet */

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink-950/40 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative w-full max-w-md bg-[var(--surface-card)]',
          'rounded-t-[var(--radius-sheet)] sm:rounded-[var(--radius-sheet)]',
          'shadow-[var(--shadow-sheet)] pb-safe-bottom',
          'max-h-[90dvh] overflow-y-auto',
        )}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-5 py-4">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--surface-sunken)]"
          >
            <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="sticky bottom-0 border-t border-[var(--border-subtle)] bg-[var(--surface-card)] px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
