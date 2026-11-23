// Where `npm run release` applies the database's changes (step 2.95, record 101), decided
// before anything connects. Local unless told otherwise, as the league-making tool:
//
// - With no --hosted it uses a PGlite folder on this computer, --db <folder>, or the
//   local test database in .local/seed-db. Hosted settings in the environment are not read.
// - --hosted needs a person at a terminal (with none it opens nothing), and the migration
//   login's address given for this one command, MIGRATION_DATABASE_URL, never kept in .env
//   and never a setting on the host: it owns the tables and sees past every league's fence
//   (T-48). The address carries no password: release.mjs asks for it with the typing
//   hidden (`askPassword`), and an address that carries one is refused (T-300).
//   The address passes the tracker's database guard (packages/providers, record 055, the
//   same one the web app, the worker and the league-making tool run), and a database not
//   on this computer has its certificate checked: PLATFORM_DATABASE_CA, read as the web
//   app and the worker read it (databaseCertificateFrom, step 2.203).
//
// It reads settings and one certificate file; it never connects. No refusal repeats any
// part of an address. Its words are in release.messages.mjs.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import {
  addressOnThisComputer,
  databaseCertificateFrom,
  platformDatabaseProblem,
  trackerProjectProblem,
} from '@srleagues/providers';
import { addressCarriesPassword } from './release-password.mjs';
import * as words from './release.messages.mjs';

/** The migration login's address, and the server's certificate, by their settings' names. */
export const migrationSetting = 'MIGRATION_DATABASE_URL';
export const caSetting = 'PLATFORM_DATABASE_CA';

const given = (value) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

/** The settings a .env file's text names, or none when it has no text. */
function namesIn(envFileText) {
  if (typeof envFileText !== 'string') return [];
  try {
    return Object.keys(parseEnv(envFileText));
  } catch {
    return [];
  }
}

/**
 * Where to apply the changes: `{ source, note? }`, or `{ problems }` (lines to print, exit
 * 2) when nothing may be opened.
 *
 * - `hosted`, `db`: the options given.
 * - `env`: the environment of this one command.
 * - `envFileText`: the text of the repository's .env, or undefined when there is none.
 * - `terminal`: whether a person can be asked at a terminal.
 * - `trackerProject`: the tracker's project from supabase/site.json (trackerProjectFor).
 * - `readText`: reads the certificate file (replaceable in tests).
 */
export function releaseSourceFor({
  hosted,
  db,
  env,
  envFileText,
  terminal,
  root,
  trackerProject,
  readText = (file) => readFileSync(file, 'utf8'),
}) {
  if (!hosted) {
    const folder = db ?? path.join(root, '.local', 'seed-db');
    return {
      source: { kind: 'folder', folder },
      ...(given(env[migrationSetting]) !== undefined
        ? { note: words.hostedSettingIgnored(migrationSetting) }
        : {}),
    };
  }
  // T-300: the address comes without its password, which is asked for at the terminal
  // with the typing hidden. One that carries one is refused before anything else, in a
  // sentence that repeats none of it.
  if (addressCarriesPassword(env[migrationSetting])) {
    return { problems: [words.passwordInAddress] };
  }
  if (db !== undefined) return { problems: [words.hostedAndFolder] };
  if (!terminal) return { problems: [words.hostedNeedsTerminal] };

  const problems = [];
  // Whatever its capitals: Windows reads environment names without regard to them.
  if (namesIn(envFileText).some((name) => name.toUpperCase() === migrationSetting)) {
    problems.push(words.loginInEnvFile(migrationSetting));
  }

  const facts = { env, appEnv: undefined, hosted: true, trackerProject };
  const fileProblem = trackerProjectProblem([migrationSetting], facts);
  if (fileProblem !== undefined) problems.push(fileProblem);

  const url = given(env[migrationSetting]);
  let address;
  if (url === undefined) problems.push(words.settingMissing(migrationSetting));
  else if (!/^postgres(?:ql)?:\/\//.test(url)) problems.push(words.notPostgres(migrationSetting));
  else {
    const guarded = platformDatabaseProblem(migrationSetting, url, facts);
    if (guarded !== undefined) problems.push(guarded);
    // Nothing at all after "?" (or "#"): no setting may ride in the address.
    else if (/[?#]/.test(url)) problems.push(words.queryStringRefused(migrationSetting));
    else address = url;
  }

  const caValue = given(env[caSetting]);
  let ca;
  if (caValue !== undefined) {
    const read = databaseCertificateFrom(caSetting, caValue, readText);
    if (read.ok) ca = read.pem;
    else problems.push(read.problem);
  }
  // A database anywhere else must have its certificate checked (L2); on this computer a
  // server without one is reached unencrypted, as the web app allows there.
  const local = address !== undefined && addressOnThisComputer(address) === true;
  if (address !== undefined && !local && caValue === undefined) {
    problems.push(words.certificateNotChecked);
  }

  if (problems.length > 0) return { problems };
  // 'off' (no encryption) only for a database on this computer: anywhere else a missing
  // certificate was refused above.
  const options = ca !== undefined ? { ssl: 'verify', ca } : { ssl: 'off' };
  return {
    source: { kind: 'migration-login', migration: { url: address, ...options } },
    askPassword: true,
    local,
  };
}
