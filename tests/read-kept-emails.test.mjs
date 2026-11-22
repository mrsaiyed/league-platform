// `node scripts/read-kept-emails.mjs` (step 2.204): it refuses an address that is not made
// up, --hosted away from a terminal and the tracker's project (the same guards as
// league:make, reused); on a PGlite folder it prints the newest code kept for the address
// and nothing else, and its refusals never repeat the address or a code.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { applyMigrations, createDatabase, keepEmail, pgliteDriver } from '@srleagues/database';
import { keptEmailsSourceFor } from '../scripts/read-kept-emails-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'scripts', 'read-kept-emails.mjs');
const ref = 'abcdefghijklmnopqrst';
const secret = 'made-up-pw-91f';

const runScript = (args) =>
  spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

const hostedOptions = (env, terminal = true) => ({
  hosted: true,
  db: undefined,
  env: { MIGRATION_DATABASE_CA: './made-up-ca.crt', ...env },
  envFileText: undefined,
  terminal,
  root: '/made-up/repository',
  trackerProject: ref,
  readText: () => 'made-up certificate',
});

test('refuses an address that is not made up, or none, and opens nothing', () => {
  for (const to of ['person@gmail.com', 'x@example.com.evil.com', '', undefined]) {
    const result = keptEmailsSourceFor({ to, ...hostedOptions({}) });
    assert.ok('problems' in result, String(to));
    for (const line of result.problems) assert.ok(!line.includes('gmail'), line);
  }
});

test('refuses --hosted away from a terminal, as league:make does', () => {
  const result = keptEmailsSourceFor({ to: 'a@example.test', ...hostedOptions({}, false) });
  assert.deepEqual(result.problems?.length, 1);
  assert.match(result.problems[0], /only at a terminal/);
  const ran = runScript(['--hosted', '--to', 'a@example.test']);
  assert.equal(ran.status, 2);
  assert.equal(ran.stdout, '');
  assert.match(ran.stderr, /only at a terminal/);
  assert.ok(!ran.stderr.includes('a@example.test'));
});

test('refuses the tracker’s project through the shared guard, and says neither it nor the password', () => {
  const result = keptEmailsSourceFor({
    to: 'a@example.test',
    ...hostedOptions({
      MIGRATION_DATABASE_URL: `postgres://postgres:${secret}@db.${ref}.supabase.co:5432/postgres`,
      PLATFORM_DATABASE_URL: `postgres://app:${secret}@db.example.test:5432/league`,
    }),
  });
  assert.ok('problems' in result);
  assert.ok(result.problems.some((line) => /tracker's Supabase project/.test(line)));
  for (const line of result.problems) {
    assert.ok(!line.includes(secret) && !line.toLowerCase().includes(ref), line);
  }
});

test('on a PGlite folder prints the newest code for the address, and nothing else', async () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'kept-emails-'));
  try {
    const pglite = new PGlite(folder);
    const run = await applyMigrations(pgliteDriver(pglite));
    assert.ok(run.ok);
    const db = createDatabase({ kind: 'pglite', pglite });
    await keepEmail(db, { to: 'new.owner@example.test', subject: 'old', text: 'Code 111111.' });
    await keepEmail(db, { to: 'other@example.test', subject: 'x', text: 'Code 222222.' });
    await keepEmail(db, { to: 'new.owner@example.test', subject: 'new', text: 'Code 482913.' });
    await keepEmail(db, {
      to: 'invited@example.test',
      subject: 'i',
      text: 'Join: https://staging.example.test/invite/made-up-token.',
    });
    await db.close();
    await pglite.close();

    const code = runScript(['--db', folder, '--to', 'New.Owner@example.test']);
    assert.equal(code.stderr, '');
    assert.equal(code.stdout, '482913\n');
    assert.equal(code.status, 0);

    const link = runScript(['--db', folder, '--to', 'invited@example.test']);
    assert.equal(link.stdout, 'https://staging.example.test/invite/made-up-token\n');

    const none = runScript(['--db', folder, '--to', 'nobody@example.test']);
    assert.equal(none.status, 1);
    assert.equal(none.stdout, '');
    assert.match(none.stderr, /No email is kept for that address/);
    assert.ok(!none.stderr.includes('nobody'));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
