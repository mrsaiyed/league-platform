import { defineConfig } from 'vitest/config';

// Runs only the new workspaces' tests, and the new code in packages/database (the
// migration runner, the schema tests, the transaction helper, typed queries, the
// stores core's commands use, the two-league isolation harness and the worker's
// queues), and the new statistics code in packages/sports/src/stats. The older node --test suites (tests/,
// the rest of packages/sports, contracts, the legacy database adapters) keep their own runner.
// Several lanes run the whole gate at the same time on one computer (docs/build/RUNBOOK.md).
// Left alone, each run starts a worker for every processor core, and six runs fight over
// the machine until tests time out. Inside a lane folder a run takes a small share instead.
const inLane = process.cwd().split('\\').join('/').includes('/.local/lanes/');

export default defineConfig({
  test: {
    ...(inLane ? { maxWorkers: 4, minWorkers: 1 } : {}),
    include: [
      'apps/web/**/*.test.ts',
      'apps/worker/**/*.test.ts',
      'packages/{core,site,ui,emails,providers,observability}/**/*.test.ts',
      'packages/contracts/**/*.test.ts',
      'packages/sports/src/stats/**/*.test.ts',
      'packages/database/src/{migrations,schema,db,queries,stores,isolation,queue}/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**'],
    // Database tests start a real PostgreSQL (PGlite) and apply every migration.
    // Alone that takes a second or two; with every test file running at once it
    // can pass the 5 and 10 second defaults, and grows with each new migration.
    testTimeout: 90_000,
    hookTimeout: 90_000,
  },
});
