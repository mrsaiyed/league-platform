// scripts/make-league.mjs itself, run as a separate program with no terminal, on a
// made-up PGlite folder (T-201). It must never make anything without a "yes" typed at
// a real terminal: not with every option given, and not with "yes" piped in.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations, pgliteDriver } from '../migrations/index.ts';

const repository = fileURLToPath(new URL('../../../../', import.meta.url));
const script = path.join(repository, 'scripts', 'make-league.mjs');

let root: string;
let folder: string;
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'make-league-script-test-'));
  folder = path.join(root, 'db');
  const db = new PGlite(folder);
  try {
    const run = await applyMigrations(pgliteDriver(db));
    if (!run.ok) throw new Error(run.error.message);
  } finally {
    await db.close();
  }
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

type Ran = { code: number | null; stdout: string; stderr: string };

/**
 * Runs the script with `args`, `input` piped in: stdin is not a terminal. The
 * repository's .env is not read (no --env-file); `envFile` gives a made-up one instead.
 */
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

const every = () => [
  '--name',
  'Made-up Hoops',
  '--short-name',
  'made-up-script-hoops',
  '--sport',
  'basketball',
  '--who-plays',
  'under-18s',
  '--listed',
  'no',
  '--city',
  'Springfield',
  '--time-zone',
  'America/Chicago',
  '--contact-email',
  'hello@example.test',
  '--owner-email',
  'script.owner@example.test',
  '--season',
  'Fall 2026',
  '--season-starts',
  '2026-09-01',
  '--season-ends',
  '2027-02-28',
  '--as',
  'script.staff@example.test',
  '--db',
  folder,
];

async function rowsIn(table: 'accounts' | 'leagues' | 'seasons' | 'activity_log') {
  const db = new PGlite(folder);
  try {
    return (await db.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0]!.n;
  } finally {
    await db.close();
  }
}

describe('npm run league:make with no terminal', () => {
  it('shows the plan, says it is not a terminal, makes nothing even with yes piped in, and exits 1', async () => {
    const ran = await runScript(every(), 'yes\n');
    expect(ran.code).toBe(1);
    expect(ran.stdout).toContain('This will make, in one step:');
    expect(ran.stdout).toContain('Made-up Hoops');
    expect(ran.stdout).toContain('first name and last initial');
    expect(ran.stdout).toContain('no screen to change “who plays” afterwards yet');
    expect(ran.stdout).toContain('Fall 2026, the current one, from 2026-09-01 to 2027-02-28');
    expect(ran.stdout).toContain('no (chosen with --listed)');
    expect(ran.stdout).toContain('this is not a terminal that can ask');
    expect(ran.stdout).toContain('Nothing was made.');
    expect(ran.stdout).not.toContain('Made:');
    for (const table of ['accounts', 'leagues', 'seasons', 'activity_log'] as const) {
      expect(await rowsIn(table)).toBe(0);
    }
  });

  it('refuses an option it does not know, before anything else', async () => {
    const ran = await runScript([...every(), '--skip-question'], 'yes\n');
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain("Unknown option '--skip-question'");
    expect(ran.stdout).not.toContain('This will make');
    expect(await rowsIn('leagues')).toBe(0);
  });

  it('tells every problem in plain words and makes nothing', async () => {
    const args = every();
    args[args.indexOf('America/Chicago')] = '+05:00';
    args[args.indexOf('2027-02-28')] = '2026-08-31';
    const ran = await runScript(args, '');
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain('An offset such as +05:00');
    expect(ran.stderr).toContain('First season ends: before it starts.');
    expect(ran.stdout).not.toContain('This will make');
  });

  it('shows the starting design and colors in the plan, the neutral one by default (step 2.187)', async () => {
    const plain = await runScript(every(), '');
    expect(plain.stdout).toContain(
      'Design          clean-court (the neutral one; choose another with --design)',
    );
    const chosen = await runScript(
      [...every(), '--design', 'midnight-gold', '--main-color', '#0A3D62'],
      '',
    );
    expect(chosen.stdout).toContain('Design          midnight-gold, with its main #0a3d62;');
    expect(await rowsIn('leagues')).toBe(0);
  });

  it('refuses a starting design that is not one and a color that is not #rrggbb, making nothing', async () => {
    const ran = await runScript(
      [...every(), '--design', 'shiny', '--accent-color', 'red; } body { display:none'],
      '',
    );
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain('Starting design: one of crest, crest-light, midnight-gold');
    expect(ran.stderr).toContain('Accent color: a color written #rrggbb');
    expect(ran.stdout).not.toContain('This will make');
    expect(await rowsIn('leagues')).toBe(0);
  });
});

describe('npm run league:make: local unless told otherwise', () => {
  // Made-up hosted settings, as a .env would hold them. The hosts answer nobody.
  const hostedSettings = async () => {
    const file = path.join(root, 'made-up.env');
    await writeFile(
      file,
      [
        'MIGRATION_DATABASE_URL=postgres://made-up:made-up-secret@127.0.0.1:1/league',
        'PLATFORM_DATABASE_URL=postgres://made-up-app:made-up-secret@127.0.0.1:1/league',
        'MIGRATION_DATABASE_SSL=off',
      ].join('\n'),
    );
    return file;
  };

  it('uses the local database even when hosted settings are present, and says it did', async () => {
    const ran = await runScript(every(), '', await hostedSettings());
    expect(ran.code).toBe(1);
    expect(ran.stdout).toContain(
      'MIGRATION_DATABASE_URL and PLATFORM_DATABASE_URL are set, and not used: this run is on this computer.',
    );
    expect(ran.stdout).toContain(`a folder: ${folder}`);
    expect(ran.stdout).not.toContain('on this computer:');
    expect(ran.stdout + ran.stderr).not.toContain('made-up-secret');
    expect(await rowsIn('leagues')).toBe(0);
  });

  it('with --hosted and no terminal, opens nothing at all, not even to read, and exits 2', async () => {
    const args = every();
    args.splice(args.indexOf('--db'), 2, '--hosted');
    const ran = await runScript(args, 'made-up-script-hoops\n', await hostedSettings());
    expect(ran.code).toBe(2);
    expect(ran.stderr).toContain('--hosted is used only at a terminal');
    expect(ran.stderr).toContain('Nothing was opened.');
    // Not asked, no plan, no attempt to connect (which would report a connection).
    expect(ran.stdout).not.toContain('This will make');
    expect(ran.stdout + ran.stderr).not.toContain('Could not connect');
    expect(ran.stdout + ran.stderr).not.toContain('made-up-secret');
  });
});
