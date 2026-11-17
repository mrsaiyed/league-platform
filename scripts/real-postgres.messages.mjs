// The words of scripts/real-postgres.mjs (step 2.202, record 092): how to use it, what it
// says it did, and each way it refuses (T-187). No line ever holds a password or an address.

export const usage = [
  'A throw-away PostgreSQL on this computer, for tests (record 092). Made-up data only.',
  '',
  'node scripts/real-postgres.mjs start    starts one: encrypted, on this computer only,',
  '                                        every migration applied, the logins made',
  'node scripts/real-postgres.mjs status   says whether one is running, and where',
  'node scripts/real-postgres.mjs stop     stops it and removes its files',
  'npm run test:real-postgres              runs the tests in tests/real-postgres on it,',
  '                                        starting one for the run if none is running',
  '',
  '  --port <number>    the port it answers on (default 54329)',
  '  --folder <folder>  where its files live, inside .local (default .local/pg)',
  '  REAL_POSTGRES_BIN  the folder holding initdb, pg_ctl and postgres, when they are not',
  '                     in /usr/lib/postgresql/<version>/bin or on PATH',
].join('\n');

export const unknownCommand = (problem) =>
  ({
    command: 'Say what to do: start, stop, status or test.',
    value: `${problem.option} needs a value after it.`,
    port: `"${problem.value}" is not a port: give a number from 1024 to 65535.`,
    option: `${problem.option} is not an option of this command.`,
    extra: `"${problem.value}" is not understood here.`,
  })[problem.problem];

export const folderOutside = (folder) =>
  `"${folder}" is not a folder of its own inside .local, which git ignores. Its files are ` +
  'removed whole when it stops, so it must be one.';

export const noPostgres = ({ looked, missing }) =>
  [
    'FAILED: no PostgreSQL was found on this computer, so nothing was started and no test ran.',
    `  Missing: ${missing.join(', ')} (PostgreSQL ${16} or newer; nothing is installed for you).`,
    `  Looked in: ${looked.join('; ')}.`,
    '  If PostgreSQL is installed somewhere else, set REAL_POSTGRES_BIN to the folder that',
    '  holds those programs.',
  ].join('\n');

export const noOpenssl = [
  'FAILED: openssl was not found on PATH, so nothing was started and no test ran.',
  '  It makes the made-up authority and the server certificate it signs.',
].join('\n');

export const tooOld = (found) =>
  `FAILED: the PostgreSQL found is ${found}; these tests need 16 or newer, where roles ` +
  'behave as they do on Supabase. Set REAL_POSTGRES_BIN to a newer one.';

export const unreadableVersion =
  'FAILED: postgres --version did not say which PostgreSQL it is, so nothing was started.';

export const rootWithoutAccount =
  'FAILED: PostgreSQL will not run as root, and this computer has no "postgres" account to ' +
  'run it as. Run this as an ordinary user.';

export const alreadyRunning = (where) =>
  `A test PostgreSQL is already running in ${where}. Nothing was changed; stop it first ` +
  'to start a fresh one.';

export const leftOver = (where) =>
  `Removed what a test PostgreSQL that is no longer running left in ${where}.`;

export const startFailed = (step, logFile) =>
  `FAILED: the test PostgreSQL could not ${step}. Its log is in ${logFile}. Nothing is ` +
  'left running.';

export const prepareFailed = (step, reason) =>
  `FAILED: the test PostgreSQL started, but ${
    {
      owner: 'the tables’ owner and its database could not be made',
      migrations: 'the migrations could not be applied',
      'app-login': 'the app’s login could not be made',
    }[step]
  } (${reason}). It was stopped and its files removed.`;

export const started = ({ version, port, where, applied }) =>
  [
    `Started a throw-away PostgreSQL ${version} for tests, on this computer only (localhost, port ${port}).`,
    `  Its files: ${where} (made-up data only; "stop" removes them).`,
    '  Encrypted: required, with a certificate signed by a made-up authority made just now.',
    `  Migrations: ${applied} applied by the repository's own runner, the certificate checked.`,
    '  Logins: the tables’ owner, made as Supabase’s "postgres" is (not a superuser; may create',
    '  roles; bypasses the fence), and app_login, made as on 2026-11-13.',
    '  A test gets the two addresses and the authority’s file from the test helper.',
    'Stop it with: node scripts/real-postgres.mjs stop',
  ].join('\n');

export const running = ({ version, port, where, pid }) =>
  `A test PostgreSQL ${version} is running in ${where}, on localhost port ${port} (process ${pid}).`;

export const notRunning = (where) => `No test PostgreSQL is running in ${where}.`;

export const stopped = (where) =>
  `Stopped the test PostgreSQL and removed ${where}. No process of it is left.`;

export const stopLeftProcess = (pids) =>
  `FAILED: the test PostgreSQL was told to stop, but its processes ${pids.join(', ')} are still running.`;

export const testsPassed = 'PASSED: the tests on a real PostgreSQL.';
export const testsFailed = 'FAILED: the tests on a real PostgreSQL. What failed is above.';
