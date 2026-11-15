// Where `npm run league:make` makes a league (scripts/make-league-source.mjs), decided
// before anything connects: on this computer unless --hosted is given at a terminal,
// and then only through addresses the tracker's database guard lets through, with the
// certificate checked for a database elsewhere. Every address and project reference
// here is made up and answers nobody; nothing here connects.
import assert from 'node:assert/strict';
import test from 'node:test';
import { answerGoesAhead, sourceFor } from '../scripts/make-league-source.mjs';

test('on a hosted database only the exact short name goes ahead, never "yes"', () => {
  const hosted = { hosted: true, slug: 'made-up-hoops' };
  assert.equal(answerGoesAhead('made-up-hoops', hosted), true);
  assert.equal(answerGoesAhead('  made-up-hoops\n', hosted), true);
  for (const answer of ['yes', 'YES', 'Made-Up-Hoops', 'made-up-hoop', '']) {
    assert.equal(answerGoesAhead(answer, hosted), false, answer);
  }
  const local = { hosted: false, slug: 'made-up-hoops' };
  assert.equal(answerGoesAhead('Yes', local), true);
  assert.equal(answerGoesAhead('made-up-hoops', local), false);
  assert.equal(answerGoesAhead('y', local), false);
});

const ref = 'abcdefghijklmnopqrst';
const secret = 'made-up-pw-91f';
const elsewhere = `postgres://migrations:${secret}@db.example.test:5432/league`;
const app = `postgres://app:${secret}@db.example.test:5432/league`;

/** sourceFor with a terminal and both logins given, the certificate checked. */
function choose(overrides = {}) {
  const read = [];
  const result = sourceFor({
    hosted: true,
    db: undefined,
    env: {
      MIGRATION_DATABASE_URL: elsewhere,
      PLATFORM_DATABASE_URL: app,
      MIGRATION_DATABASE_CA: './made-up-ca.crt',
      ...overrides.env,
    },
    envFileText: overrides.envFileText,
    terminal: overrides.terminal ?? true,
    root: '/made-up/repository',
    trackerProject: 'trackerProject' in overrides ? overrides.trackerProject : ref,
    readText: (file) => {
      read.push(file);
      return 'made-up certificate';
    },
    ...overrides.options,
  });
  return { result, read };
}

/** No refusal repeats the password or the project. */
function assertNothingPrivate(lines) {
  for (const line of lines) {
    assert.ok(!line.includes(secret), line);
    assert.ok(!line.toLowerCase().includes(ref), line);
  }
}

test('uses this computer with no --hosted, even when hosted settings are set', () => {
  const result = sourceFor({
    hosted: false,
    db: undefined,
    env: { MIGRATION_DATABASE_URL: elsewhere, PLATFORM_DATABASE_URL: app },
    envFileText: `MIGRATION_DATABASE_URL=${elsewhere}\n`,
    terminal: false,
    root: '/made-up/repository',
    trackerProject: ref,
  });
  assert.deepEqual(result.source.kind, 'folder');
  assert.match(result.source.folder, /[\\/]\.local[\\/]seed-db$/);
  assert.match(
    result.note,
    /not used: this run is on this computer\. A hosted database needs --hosted/,
  );
  assertNothingPrivate([result.note]);
  const folder = sourceFor({ hosted: false, db: 'made-up-folder', env: {}, root: '/r' });
  assert.deepEqual(folder, { source: { kind: 'folder', folder: 'made-up-folder' } });
});

test('with no terminal, --hosted opens nothing and reads no certificate', () => {
  const { result, read } = choose({ terminal: false });
  assert.deepEqual(result.problems, [
    '--hosted is used only at a terminal, where a person reads the plan and answers. Nothing was opened.',
  ]);
  assert.deepEqual(read, []);
});

test('refuses --hosted with --db', () => {
  const { result } = choose({ options: { db: 'made-up-folder' } });
  assert.deepEqual(result.problems, ['--hosted and --db cannot be given together: choose one.']);
});

test('gives both logins, the certificate checked, for a database elsewhere', () => {
  const { result, read } = choose();
  assert.deepEqual(result, {
    source: {
      kind: 'hosted',
      migration: { url: elsewhere, ssl: 'verify', ca: 'made-up certificate' },
      app: { url: app, ssl: 'verify', ca: 'made-up certificate' },
    },
  });
  assert.deepEqual(read, ['./made-up-ca.crt']);
});

test('refuses the tracker’s database however the address spells it, through the shared guard', () => {
  for (const [name, value] of [
    ['MIGRATION_DATABASE_URL', `postgres://postgres:${secret}@db.${ref}.supabase.co:5432/postgres`],
    [
      'MIGRATION_DATABASE_URL',
      `postgres://postgres:${secret}@DB.${ref.toUpperCase()}.SUPABASE.CO/postgres`,
    ],
    [
      'PLATFORM_DATABASE_URL',
      `postgres://postgres.${ref}:${secret}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
    ],
    [
      'PLATFORM_DATABASE_URL',
      `postgres://postgres.%61${ref.slice(1)}:${secret}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
    ],
  ]) {
    const { result } = choose({ env: { [name]: value } });
    assert.deepEqual(
      result.problems,
      [`${name}: invalid, must not name the tracker's Supabase project (supabase/site.json)`],
      value,
    );
    assertNothingPrivate(result.problems);
  }
});

test('refuses an address that takes its place from its query string, or is the tracker’s DATABASE_URL', () => {
  for (const query of [
    'host=elsewhere.example.test',
    'port=6543',
    'user=someone',
    'password=x',
    'options=-c%20x%3Dy',
    'dbname=other',
  ]) {
    const { result } = choose({ env: { MIGRATION_DATABASE_URL: `${elsewhere}?${query}` } });
    assert.deepEqual(result.problems, [
      'MIGRATION_DATABASE_URL: invalid, must not take its host, port, user, password, options or database name from its query string',
    ]);
  }
  const { result } = choose({ env: { DATABASE_URL: app } });
  assert.deepEqual(result.problems, [
    "PLATFORM_DATABASE_URL: invalid, must not be the tracker's database (DATABASE_URL)",
  ]);
});

test('refuses when the tracker’s project cannot be read, as staging and production do', () => {
  const { result } = choose({ trackerProject: null });
  assert.deepEqual(result.problems, [
    "supabase/site.json: could not be read, so MIGRATION_DATABASE_URL and PLATFORM_DATABASE_URL cannot be checked against the tracker's project",
  ]);
});

test('refuses addresses kept in .env: they are given for one command only', () => {
  const { result } = choose({ envFileText: `# made up\nPLATFORM_DATABASE_URL=${app}\nOTHER=1\n` });
  assert.equal(result.problems.length, 1);
  assert.match(
    result.problems[0],
    /^\.env names PLATFORM_DATABASE_URL\. For a hosted database, give the addresses for this one command only/,
  );
  assertNothingPrivate(result.problems);
});

test('refuses addresses named in .env in any capitals, as Windows reads them', () => {
  const { result } = choose({ envFileText: `migration_database_url=${elsewhere}\n` });
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /^\.env names migration_database_url\./);
});

test('refuses an SSL key in the address by name, and anything at all after "?" on --hosted', () => {
  const { result: ssl } = choose({ env: { MIGRATION_DATABASE_URL: `${elsewhere}?ssl=0` } });
  assert.deepEqual(ssl.problems, [
    'MIGRATION_DATABASE_URL: invalid, must not set ssl in its query string: whether and how the connection is encrypted is never taken from the address',
  ]);
  for (const tail of ['?application_name=web', '?', '#fragment']) {
    const { result } = choose({ env: { PLATFORM_DATABASE_URL: `${app}${tail}` } });
    assert.deepEqual(
      result.problems,
      [
        'PLATFORM_DATABASE_URL: invalid, a hosted address must have nothing after "?": take the query string off. Nothing was opened.',
      ],
      tail,
    );
  }
});

test('counts only localhost, 127.0.0.1 and ::1 as this computer for the certificate rule', () => {
  // 127.0.0.2 is refused before this, as an IP address on a hosted database.
  for (const host of ['db.localhost', 'localhost.example.test']) {
    const address = `postgres://made-up:${secret}@${host}:5432/league`;
    const { result } = choose({
      env: {
        MIGRATION_DATABASE_URL: address,
        PLATFORM_DATABASE_URL: address,
        MIGRATION_DATABASE_SSL: 'off',
      },
    });
    assert.ok(
      result.problems?.some((line) => line.includes('not on this computer')),
      host,
    );
  }
});

test('needs both logins', () => {
  const { result } = choose({ env: { PLATFORM_DATABASE_URL: '' } });
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /^PLATFORM_DATABASE_URL: missing\. --hosted needs both logins/);
});

test('refuses a database elsewhere without its certificate checked, and lets this computer off', () => {
  for (const env of [
    { MIGRATION_DATABASE_SSL: 'off' },
    { MIGRATION_DATABASE_SSL: 'no-verify' },
    { MIGRATION_DATABASE_CA: '' },
  ]) {
    const { result } = choose({ env });
    assert.equal(result.problems.length, 2, JSON.stringify(env));
    assert.match(
      result.problems[0],
      /^MIGRATION_DATABASE_URL: that database is not on this computer, so its certificate must be checked/,
    );
    assert.match(
      result.problems[1],
      /^PLATFORM_DATABASE_URL: that database is not on this computer/,
    );
    assertNothingPrivate(result.problems);
  }
  const local = `postgres://migrations:${secret}@localhost:5432/league`;
  const { result } = choose({
    env: {
      MIGRATION_DATABASE_URL: local,
      PLATFORM_DATABASE_URL: local,
      MIGRATION_DATABASE_SSL: 'off',
      MIGRATION_DATABASE_CA: '',
    },
  });
  assert.equal(result.source.kind, 'hosted');
  assert.equal(result.source.migration.ssl, 'off');
});

test('says when the certificate file cannot be read, without its contents or the address', () => {
  const { result } = choose({
    options: {
      readText: () => {
        throw new Error(`cannot read ${elsewhere}`);
      },
    },
  });
  assert.deepEqual(result.problems, ['The file named by MIGRATION_DATABASE_CA cannot be read.']);
});
