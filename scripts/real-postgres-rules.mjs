// The parts of scripts/real-postgres.mjs (step 2.202, record 092) that decide something
// without starting anything: which command was asked for, where its files may live, where
// PostgreSQL's programs are, and the server's settings. Tested in
// tests/real-postgres-rules.test.mjs without a PostgreSQL on the computer.
import path from 'node:path';

/** The programs the throw-away server needs from PostgreSQL's own folder. */
export const postgresPrograms = ['initdb', 'pg_ctl', 'postgres'];

/** The oldest PostgreSQL it runs on: roles behave as Supabase's (17) do from 16 on. */
export const oldestMajor = 16;

/** Where its files live unless told otherwise, inside the repository. */
export const defaultFolder = '.local/pg';

/** The port it answers on unless told otherwise: not 5432, which a computer's own may use. */
export const defaultPort = 54329;

/** Where Debian and Ubuntu keep each installed version's programs. */
export const debianRoot = '/usr/lib/postgresql';

const commands = ['start', 'stop', 'status', 'test'];

/**
 * What was asked for: `{ command, folder, port, files }`, or `{ problem }` naming what
 * was wrong. `files` are test files for `test`, given after the options.
 */
export function readArguments(args) {
  const [command, ...rest] = args;
  if (!commands.includes(command ?? '')) return { problem: 'command' };
  let folder = defaultFolder;
  let port = defaultPort;
  const files = [];
  let bare = false;
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    // `start --bare` (step 2.207): the tables' owner and its empty database only, as a
    // new Supabase project is, for the rehearsal of the new-test-copy procedure.
    if (arg === '--bare' && command === 'start') bare = true;
    else if (arg === '--folder' || arg === '--port') {
      const value = rest[i + 1];
      if (value === undefined || value.startsWith('--')) return { problem: 'value', option: arg };
      i += 1;
      if (arg === '--folder') folder = value;
      else {
        const number = /^\d{4,5}$/.test(value) ? Number(value) : NaN;
        if (!(number >= 1024 && number <= 65535)) return { problem: 'port', value };
        port = number;
      }
    } else if (arg.startsWith('--')) return { problem: 'option', option: arg };
    else if (command === 'test') files.push(arg);
    else return { problem: 'extra', value: arg };
  }
  return bare ? { command, folder, port, files, bare } : { command, folder, port, files };
}

/**
 * The folder as a full path, or null when it is not a folder of its own inside the
 * repository's `.local` (which git ignores): `stop` removes it whole, so nothing else
 * may ever be named.
 */
export function folderInside(root, folder) {
  const local = path.resolve(root, '.local');
  const full = path.resolve(root, folder);
  const relative = path.relative(local, full);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return full;
}

/**
 * The folders inside the repository's `.local` that lead to the server's folder, from
 * `.local` down, not the server's folder itself. When the server runs as its own account
 * (the session is root), that account must be able to pass through them, or initdb cannot
 * even read its password file; `start` makes them passable (never readable) for others.
 */
export function foldersOnTheWay(root, full) {
  const local = path.resolve(root, '.local');
  const onTheWay = [];
  for (let folder = path.dirname(full); ; folder = path.dirname(folder)) {
    const relative = path.relative(local, folder);
    if (relative.startsWith('..') || path.isAbsolute(relative)) break;
    onTheWay.unshift(folder);
    if (relative === '') break;
  }
  return onTheWay;
}

/** The file in the server's folder that keeps the modes `start` changed on the way. */
export const modesFileName = 'modes-on-the-way.json';

/**
 * The marks only this command leaves in a server's folder: its connection file (named by
 * the caller), the modes it changed on the way, and a server's data files.
 */
export const ownMarks = (connectionFile) => [connectionFile, modesFileName, 'data/PG_VERSION'];

/**
 * Whether `stop` (or a fresh `start`) may remove the folder whole: only when it is empty
 * or holds one of this command's own marks, so that naming any other folder inside
 * `.local` (`.local/lanes`, say) can never remove it. `has` says whether a path inside
 * the folder exists; `entries` is what the folder holds.
 */
export function mayRemoveFolder({ entries, has, connectionFile }) {
  return entries.length === 0 || ownMarks(connectionFile).some((mark) => has(mark));
}

/** A program's file name on this platform. */
export const programFile = (name, platform) => (platform === 'win32' ? `${name}.exe` : name);

/**
 * Where PostgreSQL's programs are: `{ ok: true, bin }`, or `{ ok: false, looked, missing }`.
 * REAL_POSTGRES_BIN, when set, is the only place looked; otherwise each version under
 * /usr/lib/postgresql, newest first, then each folder on PATH. `exists(file)` and
 * `versionsIn(folder)` are given, so the test needs no PostgreSQL.
 */
export function findPostgres({ env, platform, exists, versionsIn }) {
  const separator = platform === 'win32' ? ';' : ':';
  const named = env.REAL_POSTGRES_BIN;
  const places =
    named !== undefined && named !== ''
      ? [named]
      : [
          ...versionsIn(debianRoot)
            .filter((name) => /^\d+$/.test(name))
            .sort((a, b) => Number(b) - Number(a))
            .map((version) => path.join(debianRoot, version, 'bin')),
          ...(env.PATH ?? '').split(separator).filter((dir) => dir !== ''),
        ];
  for (const place of places) {
    if (postgresPrograms.every((name) => exists(path.join(place, programFile(name, platform))))) {
      return { ok: true, bin: place };
    }
  }
  const missing = postgresPrograms.filter(
    (name) => !places.some((place) => exists(path.join(place, programFile(name, platform)))),
  );
  return {
    ok: false,
    looked: named ? [named] : [`${debianRoot}/<version>/bin`, 'each folder on PATH'],
    missing: missing.length > 0 ? missing : postgresPrograms,
  };
}

/** The folder on PATH that holds `name`, or null. */
export function findOnPath(name, { env, platform, exists }) {
  const separator = platform === 'win32' ? ';' : ':';
  for (const dir of (env.PATH ?? '').split(separator)) {
    if (dir !== '' && exists(path.join(dir, programFile(name, platform)))) return dir;
  }
  return null;
}

/** The major version in `postgres --version`'s answer, or null. */
export function majorVersion(answer) {
  const match = /\(PostgreSQL\)\s+(\d+)(?:\.(\d+))?/.exec(answer);
  return match
    ? { major: Number(match[1]), full: match[2] ? `${match[1]}.${match[2]}` : match[1] }
    : null;
}

/** A path as postgresql.conf reads it: forward slashes, single quotes doubled. */
const confPath = (file) => `'${file.split(path.sep).join('/').replaceAll("'", "''")}'`;

/**
 * The settings added to postgresql.conf: this computer only, no socket file, encryption
 * required by pg_hba.conf, passwords as SCRAM. Nothing it holds needs to survive a crash,
 * so it does not wait for the disk.
 */
export function serverSettings({ port, certificate, key }) {
  return [
    '',
    '# Added by scripts/real-postgres.mjs (record 092): a throw-away server for tests.',
    "listen_addresses = 'localhost'",
    `port = ${port}`,
    "unix_socket_directories = ''",
    'ssl = on',
    `ssl_cert_file = ${confPath(certificate)}`,
    `ssl_key_file = ${confPath(key)}`,
    "ssl_min_protocol_version = 'TLSv1.2'",
    "password_encryption = 'scram-sha-256'",
    'max_connections = 40',
    'fsync = off',
    'synchronous_commit = off',
    'full_page_writes = off',
    "timezone = 'UTC'",
    '',
  ].join('\n');
}

/**
 * pg_hba.conf, whole: encrypted connections from this computer with a password, and
 * nothing else. A connection without encryption, or from anywhere else, finds no line
 * and is refused.
 */
export function clientRules() {
  return [
    '# Written by scripts/real-postgres.mjs (record 092). Only these are let in:',
    '# encrypted, from this computer, with a password.',
    'hostssl all all 127.0.0.1/32 scram-sha-256',
    'hostssl all all ::1/128 scram-sha-256',
    '',
  ].join('\n');
}

/** The made-up authority's name, in its certificate. */
export const authorityName = 'SR Leagues made-up test authority (not trusted anywhere)';

/** The server certificate's extensions: localhost by name and by both loopback addresses. */
export const serverExtensions = [
  'basicConstraints = critical, CA:FALSE',
  'keyUsage = critical, digitalSignature, keyEncipherment',
  'extendedKeyUsage = serverAuth',
  'subjectAltName = DNS:localhost, IP:127.0.0.1, IP:::1',
  '',
].join('\n');

/**
 * The openssl runs that make the authority and the server's certificate, in order. The
 * authority's key is removed after the last one, so nothing more can be signed with it.
 */
export function certificateSteps(tls) {
  const file = (name) => path.join(tls, name);
  const ec = ['-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes'];
  return [
    [
      'req',
      '-x509',
      ...ec,
      '-keyout',
      file('authority.key'),
      '-out',
      file('authority.crt'),
      '-days',
      '30',
      '-subj',
      `/CN=${authorityName}`,
      '-addext',
      'basicConstraints = critical, CA:TRUE',
      '-addext',
      'keyUsage = critical, keyCertSign, cRLSign',
    ],
    [
      'req',
      ...ec,
      '-keyout',
      file('server.key'),
      '-out',
      file('server.csr'),
      '-subj',
      '/CN=localhost',
    ],
    [
      'x509',
      '-req',
      '-in',
      file('server.csr'),
      '-CA',
      file('authority.crt'),
      '-CAkey',
      file('authority.key'),
      '-set_serial',
      '1',
      '-days',
      '30',
      '-extfile',
      file('server.ext'),
      '-out',
      file('server.crt'),
    ],
  ];
}

/** The pid on the first line of postmaster.pid's text, or null. */
export function pidOf(text) {
  const first = text.split('\n')[0]?.trim() ?? '';
  return /^\d+$/.test(first) ? Number(first) : null;
}

/** The state letter in a Linux /proc/<pid>/stat line (Z: ended, not yet collected). */
export function processState(stat) {
  // The command's name is in parentheses and may itself hold spaces or parentheses.
  const after = stat.slice(stat.lastIndexOf(')') + 1).trim();
  return after.split(' ')[0] ?? '';
}
