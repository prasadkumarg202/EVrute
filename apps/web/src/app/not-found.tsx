import Link from 'next/link';
import type { Metadata } from 'next';
import { EmptyState } from '@/components/ui/index';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <EmptyState
        icon={
          <svg viewBox="0 0 24 24" fill="none" className="size-7">
            <path
              d="M9.5 9.5 14.5 14.5M14.5 9.5 9.5 14.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        }
        title="We couldn't find that page"
        description="The link may be broken, or the page may have moved. Try heading back to the map."
        action={
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-text)] hover:bg-[var(--accent-hover)]"
          >
            Back to map
          </Link>
        }
      />
    </div>
  );
}
