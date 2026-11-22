// `npm run simulate -- --teams 12 --divisions 2 --rounds 6 --tracked 4 --seed 7` (step
// 2.236): makes a made-up league of that size and plays its season through the product's
// own commands (simulate-league.ts), then checks its own work and prints the report. Every
// number is optional (simulationDefaults). It uses a local made-up database of its own,
// in the git-ignored folder .local/simulate-db (never the seed's .local/seed-db), made
// fresh on every run, so one seed always gives the same league. Exits 1 if a check fails.
// Made-up data only (T-201): this opens a folder on this computer, never an address.
import { PGlite } from '@electric-sql/pglite';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyMigrations, pgliteDriver } from '../src/migrations/index.ts';
import {
  checkSimulatedLeague,
  simulateLeagueInto,
  simulationOptionsFrom,
  simulationReportLines,
} from '../src/seed/index.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const folder = path.join(root, '.local', 'simulate-db');

const options = simulationOptionsFrom(process.argv.slice(2));
if (typeof options === 'string') {
  console.error(options);
  process.exit(1);
}
rmSync(folder, { recursive: true, force: true });
mkdirSync(path.dirname(folder), { recursive: true });
const pglite = new PGlite(folder);
try {
  const started = performance.now();
  const run = await applyMigrations(pgliteDriver(pglite));
  if (!run.ok) throw new Error(`migrations failed: ${run.error.code}: ${run.error.message}`);
  console.log(
    `Made-up database: ${folder} (made fresh; migrations ${((performance.now() - started) / 1000).toFixed(1)} s)`,
  );
  const played = await simulateLeagueInto(pglite, options);
  const report = await checkSimulatedLeague(pglite, played);
  for (const line of simulationReportLines(played, report)) console.log(line);
  if (!report.passed) process.exitCode = 1;
} finally {
  await pglite.close();
}
