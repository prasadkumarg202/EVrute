import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { loginAs } from './utils';

async function firstStationHref(page: Page): Promise<string> {
  await page.goto('/');
  const stationList = page.getByRole('list', { name: 'Nearby charging stations' });
  await expect(stationList).toBeVisible({ timeout: 15_000 });
  const href = await stationList.getByRole('listitem').first().getByRole('link').getAttribute('href');
  if (!href) throw new Error('seeded station card had no href');
  return href;
}

const SERIOUS_IMPACTS = new Set(['serious', 'critical']);

async function assertNoSeriousViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => SERIOUS_IMPACTS.has(v.impact ?? ''));
  const summary = serious
    .map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s)`)
    .join('\n');
  expect(serious, `${label} had serious/critical axe violations:\n${summary}`).toEqual([]);
}

test.describe('accessibility', () => {
  test('home page: zero serious/critical axe violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('list', { name: 'Nearby charging stations' })).toBeVisible({
      timeout: 15_000,
    });
    await assertNoSeriousViolations(page, 'home page');
  });

  test('login page: zero serious/critical axe violations', async ({ page }) => {
    await page.goto('/login');
    await assertNoSeriousViolations(page, 'login page');
  });

  test('station detail page: zero serious/critical axe violations', async ({ page }) => {
    const href = await firstStationHref(page);
    await page.goto(href);
    await assertNoSeriousViolations(page, 'station detail page');
  });

  test('wallet page: zero serious/critical axe violations', async ({ page }) => {
    await loginAs(page, 'customer', '/wallet');
    await expect(page).toHaveURL(/\/wallet/);
    await assertNoSeriousViolations(page, 'wallet page');
  });

  test('the skip link is the first focusable element and works', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    await expect(focused).toHaveText('Skip to main content');
    await expect(focused).toHaveAttribute('href', '#main');

    await page.keyboard.press('Enter');
    // Following the skip link moves focus/hash target to #main.
    await expect(page).toHaveURL(/#main$/);
  });

  test('every page under test has exactly one h1', async ({ page }) => {
    const pages = ['/', '/login'];
    for (const path of pages) {
      await page.goto(path);
      const h1Count = await page.locator('h1').count();
      expect(h1Count, `${path} should have exactly one h1`).toBe(1);
    }

    const href = await firstStationHref(page);
    await page.goto(href);
    expect(await page.locator('h1').count(), `${href} should have exactly one h1`).toBe(1);
  });

  test('all images have alt text', async ({ page }) => {
    const pages = ['/', '/login'];
    for (const path of pages) {
      await page.goto(path);
      const images = page.locator('img');
      const count = await images.count();
      for (let i = 0; i < count; i += 1) {
        const alt = await images.nth(i).getAttribute('alt');
        expect(alt, `image ${i} on ${path} is missing alt text`).not.toBeNull();
      }
    }
  });

  test('keyboard Tab order reaches the bottom tab bar', async ({ page }) => {
    await loginAs(page, 'customer');
    await expect(page).toHaveURL('/');

    const tabBar = page.getByRole('navigation', { name: 'Primary' });
    await expect(tabBar).toBeVisible();

    let reached = false;
    for (let i = 0; i < 60; i += 1) {
      await page.keyboard.press('Tab');
      const isInTabBar = await page.evaluate(() => {
        const el = document.activeElement;
        const nav = document.querySelector('nav[aria-label="Primary"]');
        return !!el && !!nav && nav.contains(el);
      });
      if (isInTabBar) {
        reached = true;
        break;
      }
    }
    expect(reached, 'Tab order never reached the bottom tab bar').toBe(true);
  });
});
