import { defineConfig } from 'vitest/config';

// Runs only the new workspaces' tests. The older node --test suites
// (tests/, packages/sports, contracts, database) keep their own runner.
export default defineConfig({
  test: {
    include: [
      'apps/web/**/*.test.ts',
      'apps/worker/**/*.test.ts',
      'packages/{core,site,ui,emails,providers,observability}/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**'],
  },
});
