// `npm run seed` on a test database an older seed loaded (code review C3): the seed leagues
// are there, but without their season under way or the demo-shaped league. The script
// stops with one plain sentence that names the folder to delete and the command to run
// again, exits 1, and prints no stack trace.
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations, pgliteDriver } from '../migrations/index.ts';
import { writeDataFolder } from '../transfers/data-folder.ts';
import { seedLeaguesInto } from './seed-leagues.ts';

const script = fileURLToPath(new URL('../../scripts/seed-leagues.ts', import.meta.url));
let work = '';
beforeAll(async () => {
  work = await mkdtemp(path.join(tmpdir(), 'seed-older-'));
  const older = new PGlite();
  try {
    const run = await applyMigrations(pgliteDriver(older));
    if (!run.ok) throw new Error(run.error.message);
    // What `npm run seed` loaded before step 2.59: the two leagues, their seasons set up only.
    await seedLeaguesInto(older);
    await writeDataFolder(older, path.join(work, 'db'));
  } finally {
    await older.close();
  }
}, 120_000);
afterAll(async () => {
  await rm(work, { recursive: true, force: true, maxRetries: 5 });
});

describe('npm run seed on an older test database', () => {
  it('says in one sentence which folder to delete and what to run, and exits 1', () => {
    const folder = path.join(work, 'db');
    const ran = spawnSync(
      process.execPath,
      ['--disable-warning=ExperimentalWarning', script, folder],
      { encoding: 'utf8', timeout: 120_000 },
    );
    expect(ran.status).toBe(1);
    expect(ran.stdout).toBe('');
    const said = ran.stderr.trim().split('\n');
    expect(said).toEqual([
      `The test database in ${folder} was loaded by an older or unfinished seed: delete that folder and run npm run seed -- ${folder} again.`,
    ]);
  }, 120_000);
});
