import { defineConfig } from 'vitest/config';

// Runs only the new workspaces' tests, and the new code in packages/database (the
// migration runner, the schema tests, the transaction helper and typed queries). The
// older node --test suites (tests/, packages/sports, contracts, the legacy database
// adapters) keep their own runner.
export default defineConfig({
  test: {
    include: [
      'apps/web/**/*.test.ts',
      'apps/worker/**/*.test.ts',
      'packages/{core,site,ui,emails,providers,observability}/**/*.test.ts',
      'packages/database/src/{migrations,schema,db,queries}/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**'],
    // Database tests start a real PostgreSQL (PGlite) and apply every migration.
    // Alone that takes a second or two; with every test file running at once it
    // can pass the 5 and 10 second defaults, and grows with each new migration.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
