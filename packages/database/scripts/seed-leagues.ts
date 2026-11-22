// `npm run seed`: loads the made-up seed leagues (T-195) into a local test database that
// lives in the git-ignored folder .local/seed-db (or the folder given as the first
// argument), creating it and applying every migration first: each league with its season
// under way, its venue and one tracked game, and the demo-shaped league (seed-all-leagues.ts).
// Safe to run again. A database an older or unfinished seed loaded is not mended: the
// script says, in one sentence, which folder to delete and what to run again.
// Made-up data only (T-201): this opens a folder on this computer, never an address.
import { PGlite } from '@electric-sql/pglite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyMigrations, pgliteDriver } from '../src/migrations/index.ts';
import { SeedPartlyLoaded, seedAllLeaguesInto } from '../src/seed/index.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const folder = path.resolve(process.argv[2] ?? path.join(root, '.local', 'seed-db'));

mkdirSync(path.dirname(folder), { recursive: true });
const pglite = new PGlite(folder);
try {
  const run = await applyMigrations(pgliteDriver(pglite));
  if (!run.ok) throw new Error(`migrations failed: ${run.error.code}: ${run.error.message}`);
  for (const league of await seedAllLeaguesInto(pglite)) {
    console.log(`${league.created ? 'Loaded' : 'Already there'}: ${league.name} (${league.slug})`);
  }
  console.log(`Test database: ${folder}`);
} catch (error) {
  if (!(error instanceof SeedPartlyLoaded)) throw error;
  const again =
    process.argv[2] === undefined ? 'npm run seed' : `npm run seed -- ${process.argv[2]}`;
  console.error(
    `The test database in ${folder} was loaded by an older or unfinished seed: delete that folder and run ${again} again.`,
  );
  process.exitCode = 1;
} finally {
  await pglite.close();
}
