import { defineConfig } from 'vitest/config';

// Runs only the new workspaces' tests, and the new code in packages/database
// (the migration runner). The older node --test suites (tests/, packages/sports,
// contracts, the legacy database adapters) keep their own runner.
export default defineConfig({
  test: {
    include: [
      'apps/web/**/*.test.ts',
      'apps/worker/**/*.test.ts',
      'packages/{core,site,ui,emails,providers,observability}/**/*.test.ts',
      'packages/database/src/migrations/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**'],
  },
});
