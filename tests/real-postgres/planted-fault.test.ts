// A planted fault fails a test (step 2.202's done test): with the fence switched off on
// one table, the fence's own tests (league-fence.test.ts) are run again, here, as their
// own run, and must fail naming that table; with it back on they pass. The fault is
// switched back on whatever happens, and no other file runs meanwhile (one file at a
// time, vitest.config.ts). Since step 2.238 the start-up guard refuses such a database
// too, and so does the league-making tool, so the two leagues are made before the plant.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLoginRole } from '@srleagues/database';
import { beforeAll, describe, expect, it } from 'vitest';
import { switchFence } from '../../packages/database/src/real-postgres/real-postgres.test-helper.ts';
import { appDatabase, fresh, makeMadeUpLeague, ownerSession } from './server.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let leagues = '';
beforeAll(async () => {
  leagues = [
    await makeMadeUpLeague(`alpha-${fresh()}`),
    await makeMadeUpLeague(`bravo-${fresh()}`),
  ].join(',');
});

/** Runs the fence's tests as a run of their own: its exit code and what it printed. */
function runFenceTests() {
  const ran = spawnSync(
    process.execPath,
    [
      path.join(root, 'node_modules', 'vitest', 'vitest.mjs'),
      'run',
      '--config',
      'tests/real-postgres/vitest.config.ts',
      'tests/real-postgres/league-fence.test.ts',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        REAL_POSTGRES_MADE_UP_LEAGUES: leagues,
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      },
    },
  );
  return { status: ran.status, said: `${ran.stdout}${ran.stderr}` };
}

describe('a planted fault', () => {
  it('the fence off on one table fails the fence’s tests, naming the table', async () => {
    const owner = await ownerSession();
    const db = appDatabase(1);
    let planted: ReturnType<typeof runFenceTests>;
    let guard: string[];
    try {
      await switchFence(owner, 'programs', 'off');
      guard = await checkLoginRole(db);
      planted = runFenceTests();
    } finally {
      await db.close();
      await switchFence(owner, 'programs', 'on');
      await owner.close();
    }
    // The start-up guard names it too (step 2.238).
    expect(guard).toEqual([
      'public.programs has a league column but its row-level security is off, so every role that may read it sees every league: alter table public.programs enable row level security',
    ]);
    expect(planted.status).toBe(1);
    expect(planted.said).toContain('programs: row-level security is off');
    // Each league's default program is seen from the other league, and with none set.
    expect(planted.said).toMatch(/"table": "programs"/);
  });

  it('with the fence back on, the same tests pass', () => {
    const again = runFenceTests();
    expect(again.said).not.toContain('row-level security is off');
    expect(again.status).toBe(0);
  });
});
