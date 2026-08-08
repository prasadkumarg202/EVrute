import { expect, test } from '@playwright/test';

test.describe('PWA', () => {
  test('manifest.webmanifest is served with the required fields', async ({ page, request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('application/manifest+json');

    const manifest = await response.json();

    expect(manifest.name).toBe('EVRute — EV charging across India');
    expect(manifest.start_url).toBe('/?source=pwa');
    expect(manifest.display).toBe('standalone');

    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icon of manifest.icons) {
      expect(icon.src).toBeTruthy();
      expect(icon.sizes).toBeTruthy();
      expect(icon.type).toBeTruthy();
    }

    const maskableIcon = manifest.icons.find(
      (icon: { purpose?: string }) => icon.purpose === 'maskable',
    );
    expect(maskableIcon, 'manifest must include at least one maskable icon').toBeTruthy();

    // Sanity: the manifest is also linked from the document.
    await page.goto('/');
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveAttribute('href', '/manifest.webmanifest');
  });

  test('the offline fallback page renders with its expected content', async ({ page }) => {
    const response = await page.goto('/offline');
    expect(response?.ok()).toBe(true);

    await expect(page.getByRole('heading', { name: "You're offline" })).toBeVisible();
    await expect(page.getByText(/couldn.t reach the network/i)).toBeVisible();
    await expect(page.getByText('What still works')).toBeVisible();
    await expect(page.getByText('What needs a connection')).toBeVisible();
  });
});
