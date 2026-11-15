// scripts/remove-league.mjs itself, run as a separate program with no terminal, on a
// made-up PGlite folder (T-201). It must never remove anything without the league's
// short name typed at a real terminal: not with every option given, and not with the
// short name piped in.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { planNewLeague } from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations, pgliteDriver } from '../migrations/index.ts';
import { openLeagueMakingTarget } from './league-making-target.ts';
import { makeLeague } from './make-league.ts';

const repository = fileURLToPath(new URL('../../../../', import.meta.url));
const script = path.join(repository, 'scripts', 'remove-league.mjs');

let root: string;
let folder: string;

/** Makes a league in the folder as the tool does; `use` then changes it as given. */
async function madeInFolder(slug: string, use?: (db: PGlite, leagueId: string) => Promise<void>) {
  const db = new PGlite(folder);
  try {
    const opened = await openLeagueMakingTarget({ kind: 'pglite', pglite: db });
    if (!opened.ok) throw new Error(JSON.stringify(opened.problem));
    const planned = planNewLeague({
      name: 'Made-up Hoops',
      shortName: slug,
      sport: 'basketball',
      whoPlays: 'adults',
      city: 'Springfield',
      timeZone: 'America/Chicago',
      contactEmail: 'hello@example.test',
      ownerEmail: `${slug}.owner@example.test`,
      seasonName: 'Fall 2026',
      staffEmail: 'script.staff@example.test',
    });
    if (!planned.ok) throw new Error(JSON.stringify(planned.problems));
    const outcome = await makeLeague(opened.target, planned.plan);
    if (!outcome.ok) throw new Error(JSON.stringify(outcome));
    if (use !== undefined) await use(db, outcome.made.leagueId);
    await opened.target.close();
  } finally {
    await db.close();
  }
}

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'remove-league-script-test-'));
  folder = path.join(root, 'db');
  const db = new PGlite(folder);
  try {
    const run = await applyMigrations(pgliteDriver(db));
    if (!run.ok) throw new Error(run.error.message);
  } finally {
    await db.close();
  }
  await madeInFolder('made-up-mistake');
  await madeInFolder('made-up-used', async (db, leagueId) => {
    await db.query("insert into people (league_id, first_name, last_name) values ($1, 'A', 'B')", [
      leagueId,
    ]);
  });
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

type Ran = { code: number | null; stdout: string; stderr: string };

/** Runs the script with `args`, `input` piped in: stdin is not a terminal. */
function runScript(args: readonly string[], input: string, envFile?: string): Promise<Ran> {
  return new Promise((resolve, reject) => {
    const node = ['--disable-warning=ExperimentalWarning'];
    if (envFile !== undefined) node.push(`--env-file=${envFile}`);
    const child = spawn(process.execPath, [...node, script, ...args], {
      cwd: repository,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

const every = (slug = 'made-up-mistake') => [
  '--short-name',
  slug,
  '--as',
  'script.staff@example.test',
  '--db',
  folder,
];

async function leaguesIn(): Promise<string[]> {
  const db = new PGlite(folder);
  try {
    return (await db.query<{ slug: string }>('select slug from leagues order by slug')).rows.map(
      (r) => r.slug,
    );
  } finally {
    await db.close();
  }
}

describe('npm run league:remove with no terminal', () => {
  it('shows the plan, says it is not a terminal, removes nothing even with the short name piped in', async () => {
    const ran = await runScript(every(), 'made-up-mistake\n');
    expect(ran.code).toBe(1);
    expect(ran.stdout).toContain('This will remove, in one step:');
    expect(ran.stdout).toContain('made-up-mistake.owner@example.test: removed too');
    expect(ran.stdout).toContain(`a folder: ${folder}`);
    expect(ran.stdout).toContain('this is not a terminal that can ask');
    expect(ran.stdout).toContain('Nothing was removed.');
    expect(ran.stdout).not.toContain('Removed:');
    expect(await leaguesIn()).toEqual(['made-up-mistake', 'made-up-used']);
  });

  it('refuses a used league in plain words before asking anything', async () => {
    const ran = await runScript(every('made-up-used'), '');
    expect(ran.code).toBe(1);
    expect(ran.stderr).toContain('it has people: 1');
    expect(ran.stderr).toContain('not this tool’s to remove: that is step 2.133');
    expect(ran.stdout).not.toContain('This will remove');
    expect(await leaguesIn()).toEqual(['made-up-mistake', 'made-up-used']);
  });

  it('says plainly when no league has that short name', async () => {
    const ran = await runScript(every('made-up-nothing'), '');
    expect(ran.code).toBe(1);
    expect(ran.stderr).toContain('No league has the short name made-up-nothing');
  });

  it('refuses an option it does not know, before anything else', async () => {
    const ran = await runScript([...every(), '--yes'], 'made-up-mistake\n');
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain("Unknown option '--yes'");
    expect(await leaguesIn()).toEqual(['made-up-mistake', 'made-up-used']);
  });

  it('with --hosted and no terminal, opens nothing at all, through the twin’s own guard', async () => {
    const file = path.join(root, 'made-up.env');
    await writeFile(
      file,
      [
        'MIGRATION_DATABASE_URL=postgres://made-up:made-up-secret@127.0.0.1:1/league',
        'PLATFORM_DATABASE_URL=postgres://made-up-app:made-up-secret@127.0.0.1:1/league',
      ].join('\n'),
    );
    const args = every();
    args.splice(args.indexOf('--db'), 2, '--hosted');
    const ran = await runScript(args, 'made-up-mistake\n', file);
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain('--hosted is used only at a terminal');
    expect(ran.stdout + ran.stderr).not.toContain('Could not connect');
    expect(ran.stdout + ran.stderr).not.toContain('made-up-secret');
  });
});
