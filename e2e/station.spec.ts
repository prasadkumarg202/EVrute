import { expect, test, type Page } from '@playwright/test';

/**
 * Stations are seeded in the live Supabase project, not in this repo, so we
 * discover a real slug from the home page's search results rather than
 * hard-coding one — this stays correct even if the seed data changes.
 */
async function firstStationHref(page: Page): Promise<string> {
  await page.goto('/');
  const stationList = page.getByRole('list', { name: 'Nearby charging stations' });
  await expect(stationList).toBeVisible({ timeout: 15_000 });
  const firstLink = stationList.getByRole('listitem').first().getByRole('link');
  await expect(firstLink).toBeVisible();
  const href = await firstLink.getAttribute('href');
  if (!href) throw new Error('seeded station card had no href — cannot resolve a station slug');
  return href;
}

test.describe('station detail', () => {
  test('shows ₹/kWh AND session fee before any start action', async ({ page }) => {
    const href = await firstStationHref(page);
    await page.goto(href);

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const connectorsSection = page.locator('section', { has: page.getByRole('heading', { name: 'Connectors' }) });
    await expect(connectorsSection).toBeVisible();

    // Pricing text is rendered per-connector as "₹X.XX/kWh + ₹Y.YY session fee"
    // — visible immediately, with no click required to reveal it.
    const pricingText = connectorsSection.getByText(/session fee/i).first();
    await expect(pricingText).toBeVisible();
    const text = await pricingText.textContent();
    expect(text).toMatch(/₹[\d,]+(\.\d{2})?\/kWh/);
    expect(text).toMatch(/session fee/i);

    // The start button must exist but this test never clicks it — pricing
    // is a pre-commitment disclosure, not something gated behind Start.
    const startButton = page.getByRole('button', { name: 'Start charging' });
    await expect(startButton).toBeVisible();
  });

  test('connector statuses render with a text label, not just a colour', async ({ page }) => {
    const href = await firstStationHref(page);
    await page.goto(href);

    const connectorsSection = page.locator('section', { has: page.getByRole('heading', { name: 'Connectors' }) });
    const connectorButtons = connectorsSection.locator('ul > li > button');
    await expect(connectorButtons.first()).toBeVisible();

    // Each connector row has a badge whose visible text is one of the known
    // human-readable status labels — never just an icon or colour swatch.
    const knownLabels = ['Available', 'In use', 'Reserved', 'Offline', 'Faulted'];
    const count = await connectorButtons.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      const row = connectorButtons.nth(i);
      const rowText = await row.textContent();
      const hasKnownLabel = knownLabels.some((label) => rowText?.includes(label));
      expect(hasKnownLabel, `connector row text was: ${rowText}`).toBe(true);
    }
  });

  test('has correct metadata: title, canonical link, and JSON-LD structured data', async ({
    page,
  }) => {
    const href = await firstStationHref(page);
    const response = await page.goto(href);
    expect(response?.ok()).toBe(true);

    await expect(page).toHaveTitle(/.+ · EVRute$|.+ — EV charging in .+/);

    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveCount(1);
    const canonicalHref = await canonical.getAttribute('href');
    expect(canonicalHref).toContain(href);

    const jsonLdScripts = page.locator('script[type="application/ld+json"]');
    const scriptCount = await jsonLdScripts.count();
    expect(scriptCount).toBeGreaterThanOrEqual(2); // Place + BreadcrumbList

    const payloads = await jsonLdScripts.evaluateAll((nodes) =>
      nodes.map((n) => JSON.parse(n.textContent ?? 'null')),
    );
    const types = payloads.map((p) => p?.['@type']);
    expect(types).toContain('Place');
    expect(types).toContain('BreadcrumbList');

    const place = payloads.find((p) => p?.['@type'] === 'Place');
    expect(place.geo?.latitude).toBeTruthy();
    expect(place.geo?.longitude).toBeTruthy();
  });
});
