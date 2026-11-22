// Tests of scripts/real-postgres.mjs (step 2.202, record 092) that need no PostgreSQL:
// its rules, and that it FAILS in plain words, never skips, where PostgreSQL or openssl
// is missing. What needs a real server is in tests/real-postgres (npm run test:real-postgres).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  clientRules,
  defaultFolder,
  defaultPort,
  findPostgres,
  folderInside,
  foldersOnTheWay,
  majorVersion,
  mayRemoveFolder,
  pidOf,
  processState,
  readArguments,
  serverSettings,
} from '../scripts/real-postgres-rules.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const emptyFolder = () => fs.mkdtempSync(path.join(os.tmpdir(), 'real-postgres-none-'));

/** Runs the script with PostgreSQL looked for only in `bin`, and PATH as given. */
function run(command, { bin, PATH }) {
  const ran = spawnSync(process.execPath, ['scripts/real-postgres.mjs', command], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, REAL_POSTGRES_BIN: bin, PATH },
  });
  return { status: ran.status, out: ran.stdout, err: ran.stderr };
}

test('the commands, their options, and nothing else', () => {
  assert.deepEqual(readArguments(['start']), {
    command: 'start',
    folder: defaultFolder,
    port: defaultPort,
    files: [],
  });
  assert.deepEqual(readArguments(['test', '--port', '55001', 'tests/real-postgres/a.test.ts']), {
    command: 'test',
    folder: defaultFolder,
    port: 55001,
    files: ['tests/real-postgres/a.test.ts'],
  });
  assert.deepEqual(readArguments(['start', '--bare', '--port', '55002']), {
    command: 'start',
    folder: defaultFolder,
    port: 55002,
    files: [],
    bare: true,
  });
  assert.deepEqual(readArguments(['test', '--bare']), { problem: 'option', option: '--bare' });
  assert.deepEqual(readArguments([]), { problem: 'command' });
  assert.deepEqual(readArguments(['begin']), { problem: 'command' });
  assert.deepEqual(readArguments(['start', '--port']), { problem: 'value', option: '--port' });
  assert.deepEqual(readArguments(['start', '--port', '80']), { problem: 'port', value: '80' });
  assert.deepEqual(readArguments(['start', '--host', 'x']), {
    problem: 'option',
    option: '--host',
  });
  assert.deepEqual(readArguments(['stop', 'now']), { problem: 'extra', value: 'now' });
});

test('its files live only in a folder of their own inside .local', () => {
  assert.equal(folderInside(root, '.local/pg'), path.join(root, '.local', 'pg'));
  assert.equal(folderInside(root, '.local/a/b'), path.join(root, '.local', 'a', 'b'));
  for (const outside of ['.local', '.', 'docs', '..', '.local/../docs', '/tmp/pg', '.localpg']) {
    assert.equal(folderInside(root, outside), null, outside);
  }
});

test('the folders on the way to its own are those inside .local, from .local down', () => {
  const local = path.join(root, '.local');
  assert.deepEqual(foldersOnTheWay(root, path.join(local, 'pg')), [local]);
  assert.deepEqual(foldersOnTheWay(root, path.join(local, 'a', 'b')), [
    local,
    path.join(local, 'a'),
  ]);
});

test('it finds PostgreSQL in REAL_POSTGRES_BIN only when that is set', () => {
  const programs = new Set(['/opt/pg/initdb', '/opt/pg/pg_ctl', '/opt/pg/postgres']);
  const exists = (file) => programs.has(file);
  const versionsIn = () => ['15', '16'];
  assert.deepEqual(
    findPostgres({ env: { REAL_POSTGRES_BIN: '/opt/pg' }, platform: 'linux', exists, versionsIn }),
    { ok: true, bin: '/opt/pg' },
  );
  assert.deepEqual(
    findPostgres({ env: { REAL_POSTGRES_BIN: '/empty' }, platform: 'linux', exists, versionsIn }),
    { ok: false, looked: ['/empty'], missing: ['initdb', 'pg_ctl', 'postgres'] },
  );
});

test('otherwise the newest version under /usr/lib/postgresql, then PATH', () => {
  const programs = new Set(
    ['16', '17'].flatMap((v) =>
      ['initdb', 'pg_ctl', 'postgres'].map((name) => `/usr/lib/postgresql/${v}/bin/${name}`),
    ),
  );
  const found = findPostgres({
    env: { PATH: '/usr/bin' },
    platform: 'linux',
    exists: (file) => programs.has(file),
    versionsIn: () => ['16', '17', 'README'],
  });
  assert.deepEqual(found, { ok: true, bin: '/usr/lib/postgresql/17/bin' });
  const onPath = findPostgres({
    env: { PATH: '/a:/b' },
    platform: 'linux',
    exists: (file) => file.startsWith('/b/') || file === '/a/psql',
    versionsIn: () => [],
  });
  assert.deepEqual(onPath, { ok: true, bin: '/b' });
  const partial = findPostgres({
    env: { PATH: '/a' },
    platform: 'linux',
    exists: (file) => file === '/a/pg_ctl',
    versionsIn: () => [],
  });
  assert.deepEqual(partial.missing, ['initdb', 'postgres']);
});

test('it reads the version and the server process', () => {
  assert.deepEqual(majorVersion('postgres (PostgreSQL) 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)\n'), {
    major: 16,
    full: '16.15',
  });
  assert.deepEqual(majorVersion('postgres (PostgreSQL) 17beta1'), { major: 17, full: '17' });
  assert.equal(majorVersion('something else'), null);
  assert.equal(pidOf('2331\n/home/x/data\n'), 2331);
  assert.equal(pidOf(''), null);
  assert.equal(processState('2331 (postgres) Z 1 2331'), 'Z');
  assert.equal(processState('17 (a (b) c) S 1 17'), 'S');
});

test('it answers on this computer only, encrypted only, with a password', () => {
  const settings = serverSettings({
    port: 54329,
    certificate: '/r/.local/pg/tls/server.crt',
    key: "/r/it's/server.key",
  });
  assert.match(settings, /^listen_addresses = 'localhost'$/m);
  assert.match(settings, /^unix_socket_directories = ''$/m);
  assert.match(settings, /^ssl = on$/m);
  assert.match(settings, /^port = 54329$/m);
  assert.match(settings, /^ssl_key_file = '\/r\/it''s\/server.key'$/m);
  const rules = clientRules()
    .split('\n')
    .filter((line) => line !== '' && !line.startsWith('#'));
  assert.deepEqual(rules, [
    'hostssl all all 127.0.0.1/32 scram-sha-256',
    'hostssl all all ::1/128 scram-sha-256',
  ]);
});

for (const command of ['start', 'test']) {
  test(`without PostgreSQL, "${command}" fails naming what is missing, and starts nothing`, () => {
    const bin = emptyFolder();
    const ran = run(command, { bin, PATH: emptyFolder() });
    assert.equal(ran.status, 1);
    assert.match(ran.err, /^FAILED: no PostgreSQL was found on this computer/m);
    assert.match(ran.err, /nothing was started and no test ran/);
    assert.match(ran.err, /Missing: initdb, pg_ctl, postgres \(PostgreSQL 16 or newer/);
    assert.ok(ran.err.includes(`Looked in: ${bin}.`), ran.err);
    assert.doesNotMatch(`${ran.out}${ran.err}`, /PASSED|skipped/i);
  });
}

test('without openssl it fails naming it, and starts nothing', () => {
  const bin = emptyFolder();
  for (const name of ['initdb', 'pg_ctl', 'postgres']) fs.writeFileSync(path.join(bin, name), '');
  const ran = run('start', { bin, PATH: emptyFolder() });
  assert.equal(ran.status, 1);
  assert.match(ran.err, /^FAILED: openssl was not found on PATH/m);
});

test('stop and status with nothing running say so, and need no PostgreSQL', () => {
  const none = { bin: emptyFolder(), PATH: emptyFolder() };
  for (const command of ['status', 'stop']) {
    const ran = spawnSync(
      process.execPath,
      ['scripts/real-postgres.mjs', command, '--folder', '.local/pg-never-made'],
      {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, REAL_POSTGRES_BIN: none.bin, PATH: none.PATH },
      },
    );
    assert.equal(ran.status, 0, ran.stderr);
    assert.match(ran.stdout, /No test PostgreSQL is running in \.local\/pg-never-made\./);
  }
});

test('stop removes only a folder it made: empty, or holding one of its own marks', () => {
  const has = (present) => (mark) => present.includes(mark);
  const connectionFile = 'connection.json';
  assert.equal(mayRemoveFolder({ entries: [], has: has([]), connectionFile }), true);
  for (const mark of ['connection.json', 'modes-on-the-way.json', 'data/PG_VERSION']) {
    assert.equal(mayRemoveFolder({ entries: ['x'], has: has([mark]), connectionFile }), true, mark);
  }
  // `.local/lanes`, say: other folders and files, none of its marks.
  assert.equal(
    mayRemoveFolder({
      entries: ['2.202-real-postgres', 'notes.txt'],
      has: has([]),
      connectionFile,
    }),
    false,
  );
});

test('stop --folder on a folder it did not make refuses in one sentence, and removes nothing', () => {
  const none = { bin: emptyFolder(), PATH: emptyFolder() };
  const name = `.local/real-postgres-not-ours-${process.pid}`;
  const folder = path.join(root, name);
  fs.mkdirSync(path.join(folder, 'kept'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'kept', 'work.txt'), 'made-up work');
  try {
    const stopIn = () =>
      spawnSync(process.execPath, ['scripts/real-postgres.mjs', 'stop', '--folder', name], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, REAL_POSTGRES_BIN: none.bin, PATH: none.PATH },
      });
    const refused = stopIn();
    assert.equal(refused.status, 1);
    assert.match(
      refused.stderr,
      /^FAILED: nothing was removed, because \.local\/real-postgres-not-ours-\d+ is not a folder this command made/m,
    );
    assert.equal(fs.existsSync(path.join(folder, 'kept', 'work.txt')), true);
    // With its own mark, what a stopped server left is removed.
    fs.writeFileSync(path.join(folder, 'connection.json'), '{}');
    const removed = stopIn();
    assert.equal(removed.status, 0, removed.stderr);
    assert.equal(fs.existsSync(folder), false);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
