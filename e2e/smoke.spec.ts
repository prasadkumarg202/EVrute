import { expect, test } from '@playwright/test';

test.describe('smoke', () => {
  test('home page loads, shows seeded Hyderabad stations, and has no console/network errors', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    page.on('requestfailed', (request) => {
      failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText}`);
    });

    const response = await page.goto('/');
    expect(response?.ok(), `home page responded ${response?.status()}`).toBe(true);

    await expect(page.getByRole('heading', { name: 'Find a charger' })).toBeVisible();

    // Seeded Hyderabad stations should render as list items.
    const stationList = page.getByRole('list', { name: 'Nearby charging stations' });
    await expect(stationList).toBeVisible({ timeout: 15_000 });
    const stationItems = stationList.getByRole('listitem');
    await expect(stationItems.first()).toBeVisible();
    expect(await stationItems.count()).toBeGreaterThan(0);

    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
    expect(failedRequests, `failed network requests: ${failedRequests.join('\n')}`).toEqual([]);
  });

  test('connector-type filter narrows the visible stations', async ({ page }) => {
    await page.goto('/');
    const stationList = page.getByRole('list', { name: 'Nearby charging stations' });
    await expect(stationList).toBeVisible({ timeout: 15_000 });

    const filterGroup = page.getByRole('group', { name: 'Filter by connector type' });
    const ccs2Button = filterGroup.getByRole('button', { name: 'CCS2', exact: true });
    await expect(ccs2Button).toBeVisible();
    await expect(ccs2Button).toHaveAttribute('aria-pressed', 'false');

    await ccs2Button.click();
    await expect(ccs2Button).toHaveAttribute('aria-pressed', 'true');

    // Filtering re-fetches; wait for the loading region to disappear again
    // (or simply wait for the network to settle) before asserting.
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Find a charger' })).toBeVisible();
  });
});
