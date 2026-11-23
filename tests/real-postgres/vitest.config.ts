import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The tests on a real PostgreSQL on this computer (step 2.202, record 092), run by
// `npm run test:real-postgres` (scripts/real-postgres.mjs test), never by the usual unit
// run: they need the throw-away server that command starts. One file at a time: one of
// them switches a table's fence off for a moment, and another starts and stops a second
// server of its own.
export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    include: ['tests/real-postgres/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
