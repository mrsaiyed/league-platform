// Where `npm run release` applies the database's changes (scripts/release-source.mjs),
// decided before anything connects (step 2.95, record 101): on this computer unless
// --hosted is given at a terminal, and then only through the migration login's address,
// given for this one command, that the tracker's database guard lets through, with the
// certificate (PLATFORM_DATABASE_CA, read as step 2.203 reads it) checked for a database
// elsewhere. Every address and project reference here is made up and answers nobody.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { releaseSourceFor } from '../scripts/release-source.mjs';

const ref = 'abcdefghijklmnopqrst';
const secret = 'made-up-pw-91f';
const elsewhere = `postgres://postgres.zyxwvutsrqponmlkjihg:${secret}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;
const certificate = readFileSync(
  new URL(
    '../packages/providers/src/platform-database/fixtures/made-up-database-ca.certificate.txt',
    import.meta.url,
  ),
  'utf8',
);

/** releaseSourceFor with a terminal and the migration login given, the certificate given. */
function choose(overrides = {}) {
  return releaseSourceFor({
    hosted: true,
    db: undefined,
    env: {
      MIGRATION_DATABASE_URL: elsewhere,
      PLATFORM_DATABASE_CA: certificate,
      ...overrides.env,
    },
    envFileText: overrides.envFileText,
    terminal: overrides.terminal ?? true,
    root: '/made-up/repository',
    trackerProject: 'trackerProject' in overrides ? overrides.trackerProject : ref,
    ...('db' in overrides ? { db: overrides.db } : {}),
    ...('hosted' in overrides ? { hosted: overrides.hosted } : {}),
  });
}

/** No refusal repeats the password, or the address it rides in. */
const noSecret = (result) => {
  const text = JSON.stringify(result.problems ?? []);
  assert.equal(text.includes(secret), false, text);
  assert.equal(text.includes('pooler.supabase.com'), false, text);
};

test('without --hosted it uses a folder on this computer and does not read the login', () => {
  const result = choose({ hosted: false, db: '/made-up/db' });
  assert.deepEqual(result.source, { kind: 'folder', folder: '/made-up/db' });
  assert.match(result.note, /MIGRATION_DATABASE_URL is set, but without --hosted it is not read/);
  const seed = choose({ hosted: false, env: { MIGRATION_DATABASE_URL: '' } });
  assert.deepEqual(seed.source, { kind: 'folder', folder: '/made-up/repository/.local/seed-db' });
  assert.equal(seed.note, undefined);
});

test('a hosted release takes the migration login alone, its certificate checked', () => {
  const result = choose();
  assert.equal(result.source.kind, 'migration-login');
  assert.equal(result.source.migration.url, elsewhere);
  assert.equal(result.source.migration.ssl, 'verify');
  assert.match(result.source.migration.ca, /^-----BEGIN CERTIFICATE-----/);
  // The certificate may be a file's path, read as the web app reads it.
  const fromFile = choose({ env: { PLATFORM_DATABASE_CA: '/made-up/ca.pem' } });
  assert.equal(fromFile.problems.length, 1);
  assert.match(fromFile.problems[0], /^PLATFORM_DATABASE_CA: invalid, it names a file/);
});

test('a hosted release needs a terminal, no folder, and the login never kept in .env', () => {
  assert.match(choose({ terminal: false }).problems[0], /needs a person at a terminal/);
  assert.match(choose({ db: '/made-up/db' }).problems[0], /cannot be given together/);
  const kept = choose({ envFileText: `migration_database_url=${elsewhere}\n` });
  assert.match(kept.problems[0], /is in the \.env file/);
  noSecret(kept);
});

test('refuses the tracker’s database however the address spells it, through the shared guard', () => {
  for (const url of [
    `postgres://postgres:${secret}@db.${ref}.supabase.co:5432/postgres`,
    `postgres://postgres:${secret}@DB.${ref.toUpperCase()}.SUPABASE.CO:5432/postgres`,
    `postgres://postgres.${ref}:${secret}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
    `postgres://postgres.%61${ref.slice(1)}:${secret}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
  ]) {
    const result = choose({ env: { MIGRATION_DATABASE_URL: url } });
    assert.deepEqual(result.problems, [
      "MIGRATION_DATABASE_URL: invalid, must not name the tracker's Supabase project (supabase/site.json)",
    ]);
    assert.equal(JSON.stringify(result.problems).includes(secret), false);
  }
  const tracker = `postgres://made-up:${secret}@tracker.example.test:5432/stats`;
  const same = choose({ env: { MIGRATION_DATABASE_URL: tracker, DATABASE_URL: tracker } });
  assert.match(same.problems[0], /must not be the tracker's database \(DATABASE_URL\)/);
  noSecret(same);
  const unread = choose({ trackerProject: null });
  assert.match(unread.problems[0], /^supabase\/site\.json: could not be read/);
});

test('refuses a missing login, another kind of address, a query string, and no certificate', () => {
  assert.match(
    choose({ env: { MIGRATION_DATABASE_URL: '' } }).problems[0],
    /MIGRATION_DATABASE_URL is not set/,
  );
  assert.match(
    choose({ env: { MIGRATION_DATABASE_URL: `mysql://a:${secret}@h/d` } }).problems[0],
    /must be a postgres:\/\/ address/,
  );
  const query = choose({ env: { MIGRATION_DATABASE_URL: `${elsewhere}?ssl=false` } });
  assert.equal(query.problems.length, 1);
  noSecret(query);
  const unchecked = choose({ env: { PLATFORM_DATABASE_CA: '' } });
  assert.match(unchecked.problems[0], /its certificate must be checked: set PLATFORM_DATABASE_CA/);
  noSecret(unchecked);
  const key = choose({
    env: {
      PLATFORM_DATABASE_CA: '-----BEGIN PRIVATE KEY-----\nmade-up\n-----END PRIVATE KEY-----',
    },
  });
  assert.match(key.problems[0], /holds a private key/);
});

test('a database on this computer may go without a certificate, unencrypted', () => {
  const local = `postgres://postgres:${secret}@localhost:54329/made_up`;
  const result = choose({ env: { MIGRATION_DATABASE_URL: local, PLATFORM_DATABASE_CA: '' } });
  assert.deepEqual(result.source, {
    kind: 'migration-login',
    migration: { url: local, ssl: 'off' },
  });
});
