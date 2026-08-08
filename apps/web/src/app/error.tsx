'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/ui/index';

/**
 * Root error boundary. Next.js mounts this in place of the failed segment,
 * so it must be a self-contained client component — no dependency on
 * layout state that may itself be the thing that broke.
 */
export default function GlobalError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('Unhandled app error', error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <ErrorState
        title="Something went wrong"
        description="This screen hit an unexpected error. Your wallet and any active charging session are unaffected — try again."
        onRetry={reset}
      />
    </div>
  );
}
