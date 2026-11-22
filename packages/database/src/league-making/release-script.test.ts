// scripts/release.mjs itself (step 2.95, record 101), run as a separate program with no
// terminal, on made-up PGlite folders (T-201): it applies every change to an empty
// database and only then names the commit to deploy, a second run applies nothing, a
// failing change names no commit, and the tracker's database is refused with nothing
// applied. A hosted release never runs without a person at a terminal.
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultMigrationsFolder, loadMigrations } from '../migrations/index.ts';

const repository = fileURLToPath(new URL('../../../../', import.meta.url));
const script = path.join(repository, 'scripts', 'release.mjs');
const head = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repository,
  encoding: 'utf8',
}).trim();

let root: string;
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'release-script-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

type Ran = { code: number | null; out: string; err: string };

/** Runs the script with no terminal; `envFile` gives it made-up settings. */
function release(args: readonly string[], envFile?: string): Promise<Ran> {
  const node = ['--disable-warning=ExperimentalWarning'];
  if (envFile !== undefined) node.push(`--env-file=${envFile}`);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...node, script, ...args], {
      cwd: repository,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()));
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, out, err }));
  });
}

/** A new, empty PGlite database in its own folder, made here: the release never makes one. */
async function emptyFolder(name: string, sql?: string): Promise<string> {
  const folder = path.join(root, name);
  const db = new PGlite(folder);
  try {
    if (sql !== undefined) await db.exec(sql);
  } finally {
    await db.close();
  }
  return folder;
}

/** How many tables the folder's database holds outside the system's own schemas. */
async function tableCount(folder: string): Promise<number> {
  const db = new PGlite(folder);
  try {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from information_schema.tables
        where table_schema not in ('pg_catalog', 'information_schema')`,
    );
    return rows[0]?.n ?? -1;
  } finally {
    await db.close();
  }
}

describe('scripts/release.mjs on a PGlite folder', () => {
  it('applies every change to an empty database, then names the commit; a second run applies none', async () => {
    const loaded = await loadMigrations(defaultMigrationsFolder);
    if (!loaded.ok) throw new Error(loaded.error.code);
    const names = loaded.value.map((migration) => migration.name);
    const folder = await emptyFolder('empty');

    const first = await release(['--db', folder]);
    expect(first.err).toBe('');
    expect(first.code).toBe(0);
    expect(first.out).toContain(`Applied now: ${names.join(', ')}.`);
    expect(first.out).toContain(`Deploy commit ${head} now`);
    // The commit is named only after the changes are applied.
    expect(first.out.indexOf('Applied now:')).toBeLessThan(first.out.lastIndexOf('Deploy commit'));

    const second = await release(['--db', folder]);
    expect(second.code).toBe(0);
    expect(second.out).toContain('Applied now: none.');
    expect(second.out).toContain(`Already applied: ${names.length} files.`);
    expect(second.out).toContain(`Deploy commit ${head} now`);
  }, 120_000);

  it('a change that fails names no commit, and says not to deploy', async () => {
    const migrations = path.join(root, 'broken-migrations');
    await mkdir(migrations, { recursive: true });
    await writeFile(
      path.join(migrations, '0001_made_up_table.sql'),
      'create table made_up (id int);\n',
    );
    await writeFile(path.join(migrations, '0002_broken.sql'), 'select * from no_such_table;\n');
    const folder = await emptyFolder('broken');

    const ran = await release(['--db', folder, '--migrations', migrations]);
    expect(ran.code).toBe(1);
    expect(ran.err).toContain('in 0002_broken.sql');
    expect(ran.err).toContain('Applied before it: 0001_made_up_table.sql.');
    expect(ran.err).toContain('Do NOT deploy');
    expect(ran.out).not.toContain('Deploy commit');
  }, 60_000);

  it('with games live it stops before applying anything, unless told to go ahead (T-158)', async () => {
    const migrations = path.join(root, 'live-migrations');
    await mkdir(migrations, { recursive: true });
    await writeFile(
      path.join(migrations, '0001_made_up_table.sql'),
      'create table made_up (id int);\n',
    );
    const folder = await emptyFolder(
      'live',
      `create table public.games (status text not null);
       insert into public.games values ('live'), ('final'), ('live');`,
    );

    const stopped = await release(['--db', folder, '--migrations', migrations]);
    expect(stopped.code).toBe(3);
    expect(stopped.err).toContain('2 games are being scored right now');
    expect(stopped.err).toContain('--go-ahead');
    expect(stopped.out).not.toContain('Deploy commit');
    expect(await tableCount(folder)).toBe(1);

    const ahead = await release(['--db', folder, '--migrations', migrations, '--go-ahead']);
    expect(ahead.code).toBe(0);
    expect(ahead.out).toContain('2 games being scored right now: going ahead');
    expect(ahead.out).toContain('Applied now: 0001_made_up_table.sql.');
    expect(ahead.out).toContain(`Deploy commit ${head} now`);
  }, 60_000);

  it('refuses the tracker’s database, whatever its address, with nothing applied', async () => {
    const folder = await emptyFolder('tracker', 'create schema live_stats;');
    const ran = await release(['--db', folder]);
    expect(ran.code).toBe(1);
    expect(ran.err).toContain('the live_stats schema');
    expect(ran.out).not.toContain('Deploy commit');
    expect(await tableCount(folder)).toBe(0);
  }, 60_000);

  it('never opens a hosted database without a person at a terminal, nor makes a folder', async () => {
    const secret = 'made-up-pw-77c';
    const envFile = path.join(root, 'made-up.env');
    await writeFile(
      envFile,
      `MIGRATION_DATABASE_URL=postgres://made-up:${secret}@db.example.test:5432/league\n`,
    );
    const hosted = await release(['--hosted'], envFile);
    expect(hosted.code).toBe(2);
    expect(hosted.err).toContain('needs a person at a terminal');
    expect(hosted.out + hosted.err).not.toContain(secret);

    const missing = await release(['--db', path.join(root, 'not-made')]);
    expect(missing.code).toBe(1);
    expect(missing.err).toContain('the release never makes one');
    expect(await release(['--hosted', '--migrations', root]).then((r) => r.code)).toBe(2);
  }, 60_000);
});
