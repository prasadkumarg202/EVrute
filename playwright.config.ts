import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the EVRute PWA.
 *
 * The web server builds and starts the real Next.js app (not `next dev`) so
 * E2E runs against production output — the same JS the customer gets. It
 * talks to the live Supabase project configured in apps/web/.env.local; the
 * demo accounts (demo.customer@evrute.in etc.) and seeded Hyderabad
 * stations live there.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 8_000 },

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 14'] },
    },
  ],

  webServer: {
    command: 'pnpm --filter @evrute/web build && pnpm --filter @evrute/web start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
