import { expect, test } from '@playwright/test';
import { loginAs } from './utils';

test.describe('auth', () => {
  test('login page renders all three sign-in methods', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Welcome to EVRute' })).toBeVisible();

    const tablist = page.getByRole('tablist', { name: 'Sign-in method' });
    await expect(tablist.getByRole('tab', { name: 'phone', exact: true })).toBeVisible();
    await expect(tablist.getByRole('tab', { name: 'email', exact: true })).toBeVisible();

    // Phone is the default tab.
    await expect(page.getByLabel('Phone number')).toBeVisible();

    // Email tab.
    await tablist.getByRole('tab', { name: 'email', exact: true }).click();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();

    // Google.
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  });

  test('invalid credentials show a clear error message', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('tab', { name: 'email', exact: true }).click();
    await page.getByLabel('Email').fill('not-a-real-account@evrute.in');
    await page.getByLabel('Password').fill('DefinitelyWrongPassword123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    const passwordField = page.getByLabel('Password');
    await expect(passwordField).toHaveAttribute('aria-invalid', 'true', { timeout: 10_000 });

    // The error text renders next to the password field and is non-empty.
    const errorId = await passwordField.getAttribute('aria-describedby');
    expect(errorId).toBeTruthy();
    const errorText = await page.locator(`#${errorId}`).textContent();
    expect(errorText?.trim().length).toBeGreaterThan(0);

    // Still on the login page — no redirect happened.
    await expect(page).toHaveURL(/\/login/);
  });

  test('a successful email/password login lands on the map and shows the tab bar', async ({
    page,
  }) => {
    await loginAs(page, 'customer');

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Find a charger' })).toBeVisible();

    const tabBar = page.getByRole('navigation', { name: 'Primary' });
    await expect(tabBar).toBeVisible();
    await expect(tabBar.getByRole('link', { name: /Map/i })).toBeVisible();
    await expect(tabBar.getByRole('link', { name: /Wallet/i })).toBeVisible();
    await expect(tabBar.getByRole('link', { name: /History/i })).toBeVisible();
  });

  test('a signed-in user visiting /login is redirected away', async ({ page }) => {
    await loginAs(page, 'customer');
    await expect(page).toHaveURL('/');

    await page.goto('/login');
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
  });
});
