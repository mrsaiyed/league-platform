// `npm run seed`: loads the two made-up leagues (T-195) into a local test database that
// lives in the git-ignored folder .local/seed-db (or the folder given as the first
// argument), creating it and applying every migration first. Safe to run again.
// Made-up data only (T-201): this opens a folder on this computer, never an address.
import { PGlite } from '@electric-sql/pglite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyMigrations, pgliteDriver } from '../src/migrations/index.ts';
import { seedLeagues, seedLeaguesInto } from '../src/seed/index.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const folder = path.resolve(process.argv[2] ?? path.join(root, '.local', 'seed-db'));

mkdirSync(path.dirname(folder), { recursive: true });
const pglite = new PGlite(folder);
try {
  const run = await applyMigrations(pgliteDriver(pglite));
  if (!run.ok) throw new Error(`migrations failed: ${run.error.code}: ${run.error.message}`);
  for (const league of await seedLeaguesInto(pglite)) {
    const data = seedLeagues.find((l) => l.slug === league.slug);
    console.log(
      `${league.created ? 'Loaded' : 'Already there'}: ${data?.name ?? league.slug} (${league.slug})`,
    );
  }
  console.log(`Test database: ${folder}`);
} finally {
  await pglite.close();
}
