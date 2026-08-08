import type { Metadata } from 'next';
import { LoginClient } from '@/components/auth/login-client';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

interface PageProps {
  readonly searchParams: Promise<{ readonly next?: string; readonly error?: string }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const next = params.next && params.next.startsWith('/') ? params.next : '/';

  return <LoginClient next={next} forbidden={params.error === 'forbidden'} />;
}
