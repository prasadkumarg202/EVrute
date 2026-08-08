import { expect, test } from '@playwright/test';
import { loginAs } from './utils';

/**
 * Access-control regression test. Two layers protect /owner and /admin:
 * middleware.ts redirects before the page even renders, and
 * requireRole() in the page itself is the belt-and-suspenders check. This
 * spec is deliberately strict about the FINAL landing URL, not just "did
 * not throw" — a soft 403 message rendered at /owner would still fail this.
 */
test.describe('rbac', () => {
  test('anonymous user hitting /owner is redirected to /login', async ({ page }) => {
    const response = await page.goto('/owner');
    expect(response?.ok()).toBe(true);
    await expect(page).toHaveURL(/\/login\?next=%2Fowner/);
    await expect(page.getByRole('heading', { name: 'Welcome to EVRute' })).toBeVisible();
  });

  test('anonymous user hitting /admin is redirected to /login', async ({ page }) => {
    const response = await page.goto('/admin');
    expect(response?.ok()).toBe(true);
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
    await expect(page.getByRole('heading', { name: 'Welcome to EVRute' })).toBeVisible();
  });

  test('a signed-in CUSTOMER hitting /owner is redirected away, never shown the owner page', async ({
    page,
  }) => {
    await loginAs(page, 'customer');
    await page.goto('/owner');

    await expect(page).not.toHaveURL(/\/owner/);
    await expect(page).toHaveURL(/error=forbidden/);
    // Never rendered the owner dashboard content.
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toHaveCount(0);
  });

  test('a signed-in CUSTOMER hitting /admin is redirected away, never shown the admin page', async ({
    page,
  }) => {
    await loginAs(page, 'customer');
    await page.goto('/admin');

    await expect(page).not.toHaveURL(/\/admin/);
    await expect(page).toHaveURL(/error=forbidden/);
    await expect(page.getByRole('heading', { name: 'Platform dashboard' })).toHaveCount(0);
  });

  test('a signed-in OWNER can reach /owner but is redirected away from /admin', async ({
    page,
  }) => {
    await loginAs(page, 'owner');

    await page.goto('/owner');
    await expect(page).toHaveURL(/\/owner$/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    await page.goto('/admin');
    await expect(page).not.toHaveURL(/\/admin/);
    await expect(page).toHaveURL(/error=forbidden/);
  });

  test('a signed-in ADMIN can reach both /owner and /admin', async ({ page }) => {
    await loginAs(page, 'admin');

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Platform dashboard' })).toBeVisible();

    await page.goto('/owner');
    await expect(page).toHaveURL(/\/owner$/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });
});
