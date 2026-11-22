// A planted fault fails a test (step 2.202's done test): with the fence switched off on
// one table, the fence's own tests (league-fence.test.ts) are run again, here, as their
// own run, and must fail naming that table; with it back on they pass. The fault is
// switched back on whatever happens, and no other file runs meanwhile (one file at a
// time, vitest.config.ts).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { switchFence } from '../../packages/database/src/real-postgres/real-postgres.test-helper.ts';
import { ownerSession } from './server.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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
    { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } },
  );
  return { status: ran.status, said: `${ran.stdout}${ran.stderr}` };
}

describe('a planted fault', () => {
  it('the fence off on one table fails the fence’s tests, naming the table', async () => {
    const owner = await ownerSession();
    let planted: ReturnType<typeof runFenceTests>;
    try {
      await switchFence(owner, 'programs', 'off');
      planted = runFenceTests();
    } finally {
      await switchFence(owner, 'programs', 'on');
      await owner.close();
    }
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
