import type { Page } from '@playwright/test';

/**
 * Demo accounts seeded in the live Supabase project (see task brief).
 * Password is shared across all three.
 */
export const DEMO_ACCOUNTS = {
  customer: { email: 'demo.customer@evrute.in', password: 'Passw0rd!23' },
  owner: { email: 'demo.owner@evrute.in', password: 'Passw0rd!23' },
  admin: { email: 'demo.admin@evrute.in', password: 'Passw0rd!23' },
} as const;

export type DemoRole = keyof typeof DEMO_ACCOUNTS;

/**
 * Logs in via the email/password form on /login and waits for the redirect
 * away from /login to complete.
 */
export async function loginAs(page: Page, role: DemoRole, next = '/'): Promise<void> {
  const { email, password } = DEMO_ACCOUNTS[role];
  const url = next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`;
  await page.goto(url);

  await page.getByRole('tab', { name: 'email', exact: true }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15_000 });
}
