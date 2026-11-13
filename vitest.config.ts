import { constants, setPriority } from 'node:os';
import { defineConfig } from 'vitest/config';

// Runs only the new workspaces' tests, and the new code in packages/database (the
// migration runner, the schema tests, the transaction helper, typed queries, the
// stores core's commands use and the two-league isolation harness), and the new
// statistics and standings code in packages/sports/src/stats and src/standings. The older
// node --test suites (tests/, the rest of packages/sports, contracts, the legacy database
// adapters) keep their own runner.
// Several lanes run the whole gate at the same time on one computer (docs/build/RUNBOOK.md).
// Left alone, each run starts a worker for every processor core, and six runs fight over
// the machine until tests time out. Inside a lane folder a run takes a small share instead.
const inLane = process.cwd().split('\\').join('/').includes('/.local/lanes/');

try {
  setPriority(0, constants.priority.PRIORITY_ABOVE_NORMAL);
} catch {
  // Not allowed on this computer: run at the usual priority.
}

export default defineConfig({
  test: {
    ...(inLane ? { maxWorkers: 2, minWorkers: 1 } : {}),
    include: [
      'vitest.reporter.test.ts',
      'apps/web/**/*.test.ts',
      'apps/worker/**/*.test.ts',
      'packages/{core,site,ui,emails,providers,observability}/**/*.test.ts',
      'packages/contracts/**/*.test.ts',
      'packages/sports/src/{stats,standings}/**/*.test.ts',
      'packages/sports/src/*.test.ts',
      'packages/database/src/{migrations,schema,db,queries,stores,isolation,queue}/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**'],
    setupFiles: ['./vitest.setup.ts'],
    reporters: ['default', './vitest.reporter.ts'],
    // Database tests start a real PostgreSQL (PGlite) and apply every migration.
    // Alone that takes a second or two; with every test file running at once it
    // can pass the 5 and 10 second defaults, and grows with each new migration. A test that
    // is working passes however long it takes; the limit only stops one that is stuck.
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
