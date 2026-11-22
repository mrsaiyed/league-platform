// A throw-away PostgreSQL on this computer, for tests (step 2.202, record 092, T-292).
//
//   node scripts/real-postgres.mjs start | stop | status
//   npm run test:real-postgres            (node scripts/real-postgres.mjs test)
//
// Everything on the database had run only on the in-process one (PGlite): one session,
// no encryption, everything as a superuser. This starts a real PostgreSQL from the
// programs this computer already has (nothing is installed), its files in the git-ignored
// .local/pg, answering on this computer only (localhost, no socket file), encryption
// required with a certificate signed by a made-up authority made here with openssl. In
// it: a tables' owner made as Supabase's `postgres` is, every migration applied by the
// repository's own runner with the certificate checked, and `app_login` made as on
// 2026-11-13 (packages/database/src/real-postgres). Made-up data only (T-201); it
// reaches no other computer and no real service.
//
// `stop` stops it, checks that no process of it is left, and removes its folder, so git
// sees nothing. `test` starts one when none is running, runs the tests in
// tests/real-postgres on it, and stops what it started. Where no PostgreSQL is found it
// FAILS saying what is missing; it never skips.
//
// As root (a cloud machine), PostgreSQL refuses to run: the server then runs as the
// computer's own unprivileged `postgres` account, which the PostgreSQL package made.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  prepareRealPostgres,
  localAddress,
  realPostgresNames,
  connectionFileName,
} from '../packages/database/src/real-postgres/index.ts';
import {
  certificateSteps,
  clientRules,
  findOnPath,
  findPostgres,
  folderInside,
  foldersOnTheWay,
  majorVersion,
  mayRemoveFolder,
  modesFileName,
  oldestMajor,
  pidOf,
  processState,
  programFile,
  readArguments,
  serverExtensions,
  serverSettings,
} from './real-postgres-rules.mjs';
import * as words from './real-postgres.messages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shown = (folder) => path.relative(root, folder).split(path.sep).join('/');

const layout = (folder) => ({
  folder,
  data: path.join(folder, 'data'),
  tls: path.join(folder, 'tls'),
  log: path.join(folder, 'server.log'),
  connection: path.join(folder, connectionFileName),
});

/** PostgreSQL's programs, openssl and the version, or a refusal already printed. */
function findTools() {
  const found = findPostgres({
    env: process.env,
    platform: process.platform,
    exists: (file) => fs.existsSync(file),
    versionsIn: (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir) : []),
  });
  if (!found.ok) return fail(words.noPostgres(found));
  const openssl = findOnPath('openssl', {
    env: process.env,
    platform: process.platform,
    exists: (file) => fs.existsSync(file),
  });
  if (openssl === null) return fail(words.noOpenssl);
  const program = (name) => path.join(found.bin, programFile(name, process.platform));
  const answer = spawnSync(program('postgres'), ['--version'], { encoding: 'utf8' });
  const version = majorVersion(answer.stdout ?? '');
  if (version === null) return fail(words.unreadableVersion);
  if (version.major < oldestMajor) return fail(words.tooOld(version.full));
  const runAs = serverAccount();
  if (runAs === false) return fail(words.rootWithoutAccount);
  return {
    program,
    openssl: path.join(openssl, programFile('openssl', process.platform)),
    version: version.full,
    runAs,
  };
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
  return null;
}

/**
 * Who the server runs as: undefined for this user; the `postgres` account's ids when this
 * runs as root; false when it runs as root and there is no such account.
 */
function serverAccount() {
  if (typeof process.getuid !== 'function' || process.getuid() !== 0) return undefined;
  const passwd = fs.existsSync('/etc/passwd') ? fs.readFileSync('/etc/passwd', 'utf8') : '';
  const line = passwd.split('\n').find((entry) => entry.startsWith('postgres:'));
  const [, , uid, gid] = line?.split(':') ?? [];
  if (!uid || !gid) return false;
  return { uid: Number(uid), gid: Number(gid) };
}

/** Runs one of PostgreSQL's programs as the server's account; its output is kept, not shown. */
function runProgram(tools, name, args) {
  return spawnSync(tools.program(name), args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: root,
    env: { PATH: process.env.PATH ?? '', LANG: 'C', LC_ALL: 'C', TZ: 'UTC' },
    ...(tools.runAs ?? {}),
  });
}

const giveTo = (tools, file) => {
  if (tools.runAs) fs.chownSync(file, tools.runAs.uid, tools.runAs.gid);
};

/** The server's process id when it is running from `data`, else null. */
function runningPid(paths) {
  const pidFile = path.join(paths.data, 'postmaster.pid');
  if (!fs.existsSync(pidFile)) return null;
  const pid = pidOf(fs.readFileSync(pidFile, 'utf8'));
  return pid !== null && alive(pid) ? pid : null;
}

/**
 * Whether the process runs. One that has ended but whose parent never collected it (a
 * "zombie": on a machine whose first process does not, every server that stopped stays
 * one) runs nothing and holds no port or file, so it counts as gone.
 */
function alive(pid) {
  try {
    process.kill(pid, 0);
  } catch (error) {
    if (error.code !== 'EPERM') return false;
  }
  return !endedOnLinux(pid);
}

function endedOnLinux(pid) {
  try {
    return processState(fs.readFileSync(`/proc/${pid}/stat`, 'utf8')) === 'Z';
  } catch {
    return false;
  }
}

/**
 * Every process still working in the folder. PostgreSQL's server and each of its helpers
 * work in the data folder, so on Linux each one's working folder shows it; elsewhere only
 * the server's own process can be asked about.
 */
function processesIn(paths, pid) {
  if (process.platform !== 'linux' || !fs.existsSync('/proc')) {
    return pid !== null && alive(pid) ? [pid] : [];
  }
  const found = [];
  for (const entry of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(entry) || Number(entry) === process.pid) continue;
    try {
      const cwd = fs.readlinkSync(`/proc/${entry}/cwd`);
      if (cwd === paths.folder || cwd.startsWith(paths.folder + path.sep))
        found.push(Number(entry));
    } catch {
      // Gone already, or not ours to read.
    }
  }
  return found;
}

const readConnection = (paths) => {
  try {
    return JSON.parse(fs.readFileSync(paths.connection, 'utf8'));
  } catch {
    return {};
  }
};

/**
 * Whether the folder may be removed whole: it is empty, or holds this command's own marks.
 * Otherwise says so, plainly, and it is left as it is.
 */
function mayRemove(paths) {
  let entries;
  try {
    entries = fs.readdirSync(paths.folder);
  } catch {
    return true;
  }
  const allowed = mayRemoveFolder({
    entries,
    has: (mark) => fs.existsSync(path.join(paths.folder, mark)),
    connectionFile: path.basename(paths.connection),
  });
  if (!allowed) {
    console.error(words.notOurFolder(shown(paths.folder)));
    process.exitCode = 1;
  }
  return allowed;
}

/** Puts back the modes `start` changed on the folders on the way, as it noted them. */
function restoreModesOnTheWay(paths) {
  let noted;
  try {
    noted = JSON.parse(fs.readFileSync(path.join(paths.folder, modesFileName), 'utf8'));
  } catch {
    return;
  }
  const onTheWay = foldersOnTheWay(root, paths.folder);
  for (const [folder, mode] of Object.entries(noted)) {
    // Only a folder on the way to this one, whatever the file says.
    if (!onTheWay.includes(folder) || typeof mode !== 'number') continue;
    try {
      fs.chmodSync(folder, mode);
    } catch {
      // Gone already.
    }
  }
}

/** Removes the folder whole, the modes on the way to it put back first. */
function removeFolder(paths) {
  restoreModesOnTheWay(paths);
  fs.rmSync(paths.folder, { recursive: true, force: true });
}

/** Starts a fresh server in the folder. Returns true when it runs, ready for tests. */
async function start(tools, paths, port) {
  if (runningPid(paths) !== null) {
    console.log(words.alreadyRunning(shown(paths.folder)));
    return true;
  }
  if (fs.existsSync(paths.folder)) {
    if (!mayRemove(paths)) return false;
    removeFolder(paths);
    console.log(words.leftOver(shown(paths.folder)));
  }
  fs.mkdirSync(paths.tls, { recursive: true, mode: 0o700 });
  fs.chmodSync(paths.folder, 0o700);
  giveTo(tools, paths.folder);
  // mkdir made `.local` (and any folder on the way) for this session's account alone:
  // the server's own account may pass through them, without reading what else is there.
  // Their modes are noted first, and `stop` (or a failed start) puts them back.
  if (tools.runAs) {
    const onTheWay = foldersOnTheWay(root, paths.folder);
    const noted = Object.fromEntries(
      onTheWay.map((folder) => [folder, fs.statSync(folder).mode & 0o7777]),
    );
    fs.writeFileSync(path.join(paths.folder, modesFileName), JSON.stringify(noted, null, 2), {
      mode: 0o600,
    });
    for (const folder of onTheWay) fs.chmodSync(folder, noted[folder] | 0o011);
  }

  const stopAndClean = (step) => {
    console.error(words.startFailed(step, shown(paths.log)));
    if (runningPid(paths) !== null)
      runProgram(tools, 'pg_ctl', ['-D', paths.data, '-m', 'immediate', '-w', 'stop']);
    restoreModesOnTheWay(paths);
    return false;
  };

  // The made-up authority, and the server's certificate it signs; then its key is gone.
  fs.writeFileSync(path.join(paths.tls, 'server.ext'), serverExtensions);
  for (const args of certificateSteps(paths.tls)) {
    const made = spawnSync(tools.openssl, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      // Git Bash would turn "/CN=..." into a Windows path.
      env: { ...process.env, MSYS_NO_PATHCONV: '1' },
    });
    if (made.status !== 0) {
      fs.writeFileSync(paths.log, made.stderr ?? '');
      return stopAndClean('make its certificate');
    }
  }
  for (const name of ['authority.key', 'server.csr', 'server.ext']) {
    fs.rmSync(path.join(paths.tls, name), { force: true });
  }
  const certificate = path.join(paths.tls, 'server.crt');
  const key = path.join(paths.tls, 'server.key');
  const authority = path.join(paths.tls, 'authority.crt');
  fs.chmodSync(key, 0o600);
  for (const file of [paths.tls, certificate, key]) giveTo(tools, file);

  const passwords = {
    superuser: randomBytes(24).toString('hex'),
    owner: randomBytes(24).toString('hex'),
    app: randomBytes(24).toString('hex'),
  };
  // initdb reads the superuser's password from a file, removed as soon as it has.
  const passwordFile = path.join(paths.folder, 'superuser-password');
  fs.writeFileSync(passwordFile, passwords.superuser, { mode: 0o600 });
  giveTo(tools, passwordFile);
  const made = runProgram(tools, 'initdb', [
    '-D',
    paths.data,
    '-U',
    realPostgresNames.superuser,
    `--pwfile=${passwordFile}`,
    '--auth=scram-sha-256',
    '--encoding=UTF8',
    '--locale=C',
    '--no-sync',
    '--no-instructions',
  ]);
  fs.rmSync(passwordFile, { force: true });
  if (made.status !== 0) {
    fs.writeFileSync(paths.log, `${made.stdout ?? ''}${made.stderr ?? ''}`);
    return stopAndClean('make its database files');
  }
  fs.appendFileSync(
    path.join(paths.data, 'postgresql.conf'),
    serverSettings({ port, certificate, key }),
  );
  fs.writeFileSync(path.join(paths.data, 'pg_hba.conf'), clientRules());

  const begun = runProgram(tools, 'pg_ctl', [
    '-D',
    paths.data,
    '-l',
    paths.log,
    '-w',
    '-t',
    '60',
    'start',
  ]);
  if (begun.status !== 0 || runningPid(paths) === null) return stopAndClean('start');

  const ca = fs.readFileSync(authority, 'utf8');
  const prepared = await prepareRealPostgres({ port, ca }, passwords);
  if (!prepared.ok) {
    console.error(words.prepareFailed(prepared.step, prepared.reason));
    await stop(tools, paths, { quiet: true });
    return false;
  }
  const { owner, app, database } = realPostgresNames;
  fs.writeFileSync(
    paths.connection,
    JSON.stringify(
      {
        version: tools.version,
        port,
        ownerUrl: localAddress(port, owner, passwords.owner, database),
        appUrl: localAddress(port, app, passwords.app, database),
        caFile: authority,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    words.started({
      version: tools.version,
      port,
      where: shown(paths.folder),
      applied: prepared.applied,
    }),
  );
  return true;
}

/** Stops the server, checks no process of it is left, and removes the folder. */
async function stop(tools, paths, { quiet = false } = {}) {
  const pid = runningPid(paths);
  if (pid === null && !fs.existsSync(paths.folder)) {
    if (!quiet) console.log(words.notRunning(shown(paths.folder)));
    return true;
  }
  if (pid === null && !mayRemove(paths)) return false;
  if (pid !== null) {
    if (tools === null) return false;
    runProgram(tools, 'pg_ctl', ['-D', paths.data, '-m', 'fast', '-w', '-t', '60', 'stop']);
  }
  const left = processesIn(paths, pid);
  if (left.length > 0) {
    console.error(words.stopLeftProcess(left));
    process.exitCode = 1;
    return false;
  }
  removeFolder(paths);
  if (!quiet)
    console.log(
      pid === null ? words.leftOver(shown(paths.folder)) : words.stopped(shown(paths.folder)),
    );
  return true;
}

function status(paths) {
  const pid = runningPid(paths);
  if (pid === null) {
    console.log(words.notRunning(shown(paths.folder)));
    return;
  }
  const { version = '?', port = '?' } = readConnection(paths);
  console.log(words.running({ version, port, where: shown(paths.folder), pid }));
}

/** Runs the tests in tests/real-postgres on a running server, starting one if none is. */
async function test(tools, paths, port, files) {
  const startedHere = runningPid(paths) === null;
  if (startedHere && !(await start(tools, paths, port))) {
    process.exitCode = 1;
    return;
  }
  // Ctrl+C reaches the tests; this waits for them, then stops what it started.
  process.on('SIGINT', () => {});
  const vitest = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
  const ran = spawnSync(
    process.execPath,
    [vitest, 'run', '--config', 'tests/real-postgres/vitest.config.ts', ...files],
    {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, REAL_POSTGRES_FOLDER: shown(paths.folder) },
    },
  );
  const stoppedClean = startedHere ? await stop(tools, paths) : true;
  const passed = ran.status === 0 && stoppedClean;
  console.log(passed ? words.testsPassed : words.testsFailed);
  process.exitCode = passed ? 0 : 1;
}

async function main(args) {
  const asked = readArguments(args);
  if ('problem' in asked) {
    console.error(`${words.unknownCommand(asked)}\n\n${words.usage}`);
    process.exitCode = 1;
    return;
  }
  const folder = folderInside(root, asked.folder);
  if (folder === null) {
    fail(words.folderOutside(asked.folder));
    return;
  }
  const paths = layout(folder);
  if (asked.command === 'status') return status(paths);
  if (asked.command === 'stop' && runningPid(paths) === null) {
    await stop(null, paths);
    return;
  }
  const tools = findTools();
  if (tools === null) return;
  if (asked.command === 'stop') await stop(tools, paths);
  else if (asked.command === 'start') {
    if (!(await start(tools, paths, asked.port))) process.exitCode = 1;
  } else await test(tools, paths, asked.port, asked.files);
}

await main(process.argv.slice(2));
