import type { Metadata } from 'next';
import { LoginClient } from '@/components/auth/login-client';
import { safeNextPath } from '@/lib/auth/landing';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

interface PageProps {
  readonly searchParams: Promise<{ readonly next?: string; readonly error?: string }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  // null (not '/') when the user didn't ask for a specific page — the client
  // then routes by role rather than dumping an owner on the driver's map.
  const next = safeNextPath(params.next);

  return <LoginClient next={next} forbidden={params.error === 'forbidden'} />;
}
