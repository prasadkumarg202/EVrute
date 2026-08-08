import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Root Vitest config for the pnpm workspace.
 *
 * `server-only` throws unconditionally when resolved under Node's default
 * export condition (it only no-ops under the `react-server` condition that
 * Next.js sets during the RSC build). Vitest runs plain Node, so importing
 * `@evrute/core/server` here would throw at import time unless we alias it
 * to the package's no-op `empty.js` — the same file Next uses for
 * server-only code that legitimately runs on the server.
 */
export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@evrute/core/server',
        replacement: fileURLToPath(new URL('./packages/core/src/server.ts', import.meta.url)),
      },
      {
        find: '@evrute/core',
        replacement: fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      },
      {
        find: '@evrute/db',
        replacement: fileURLToPath(new URL('./packages/db/src/index.ts', import.meta.url)),
      },
      {
        find: 'server-only',
        replacement: fileURLToPath(
          new URL(
            './node_modules/.pnpm/server-only@0.0.1/node_modules/server-only/empty.js',
            import.meta.url,
          ),
        ),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'apps/web/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/**/src/**/*.ts', 'apps/web/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.d.ts',
        'packages/db/src/database.types.ts',
      ],
    },
  },
});
