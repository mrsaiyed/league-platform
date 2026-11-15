// Where `npm run league:make` makes the league (record 057), decided before anything
// connects. Local unless told otherwise:
//
// - With no --hosted it uses a PGlite folder on this computer, --db <folder> or the
//   local test database in .local/seed-db, even when hosted settings are in the
//   environment or .env: they are not read.
// - --hosted needs a terminal (with none it opens nothing, not even to read), both
//   logins given for this one command and never kept in .env, each passing the
//   tracker's database guard (packages/providers, record 055, the same one the web
//   app and the worker run), and, for a database not on this computer, its
//   certificate checked (MIGRATION_DATABASE_SSL=verify with MIGRATION_DATABASE_CA).
//
// It reads settings and one certificate file; it never connects. Its words are in
// make-league.messages.mjs; no refusal repeats any part of an address.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import {
  addressOnThisComputer,
  platformDatabaseProblem,
  trackerProjectProblem,
} from '@srleagues/providers';
import * as words from './make-league.messages.mjs';

/** The two logins of a hosted database, by the names of their settings. */
export const migrationSetting = 'MIGRATION_DATABASE_URL';
export const appSetting = 'PLATFORM_DATABASE_URL';
const sslSetting = 'MIGRATION_DATABASE_SSL';
const caSetting = 'MIGRATION_DATABASE_CA';

const given = (value) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

/**
 * Whether an answer to the question goes ahead: on this computer "yes" (any capitals);
 * on a hosted database only the league's exact short name, so a habit of typing "yes"
 * cannot make a league on a real database.
 */
export function answerGoesAhead(answer, { hosted, slug }) {
  const typed = answer.trim();
  return hosted ? typed === slug : typed.toLowerCase() === 'yes';
}

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
 * Where to make the league: `{ source, note? }`, or `{ problems }` (lines to print,
 * exit 2) when it may not be opened. Reads no address beyond these checks.
 *
 * - `hosted`, `db`: the options given.
 * - `env`: the environment (which may include .env, read by npm run league:make).
 * - `envFileText`: the text of the repository's .env, or undefined when there is none.
 * - `terminal`: whether a person can be asked at a terminal.
 * - `trackerProject`: the tracker's project from supabase/site.json (trackerProjectFor).
 * - `readText`: reads the certificate file (replaceable in tests).
 */
export function sourceFor({
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
    const ignored = [migrationSetting, appSetting].filter((name) => given(env[name]) !== undefined);
    return {
      source: { kind: 'folder', folder },
      ...(ignored.length > 0 ? { note: words.hostedSettingsIgnored(ignored) } : {}),
    };
  }
  if (db !== undefined) return { problems: [words.hostedAndFolder] };
  if (!terminal) return { problems: [words.hostedNeedsTerminal] };

  const problems = [];
  // Whatever its capitals: Windows reads environment names without regard to them.
  const inEnvFile = namesIn(envFileText).filter((name) =>
    [migrationSetting, appSetting].includes(name.toUpperCase()),
  );
  if (inEnvFile.length > 0) problems.push(words.addressesInEnvFile(inEnvFile));

  const facts = { env, appEnv: undefined, hosted: true, trackerProject };
  const fileProblem = trackerProjectProblem([migrationSetting, appSetting], facts);
  if (fileProblem !== undefined) problems.push(fileProblem);

  const addresses = {};
  for (const name of [migrationSetting, appSetting]) {
    const value = given(env[name]);
    if (value === undefined) {
      problems.push(words.settingMissing(name));
      continue;
    }
    if (!/^postgres(?:ql)?:\/\//.test(value)) {
      problems.push(words.notPostgres(name));
      continue;
    }
    const guarded = platformDatabaseProblem(name, value, facts);
    if (guarded !== undefined) {
      problems.push(guarded);
      continue;
    }
    // Nothing at all after "?" (or "#"): no setting may ride in the address.
    if (/[?#]/.test(value)) {
      problems.push(words.queryStringRefused(name));
      continue;
    }
    addresses[name] = value;
  }

  const ssl = given(env[sslSetting]) ?? 'verify';
  if (!['verify', 'no-verify', 'off'].includes(ssl)) problems.push(words.badSsl);
  const caFile = given(env[caSetting]);
  let ca;
  if (caFile !== undefined) {
    try {
      ca = readText(caFile);
    } catch {
      problems.push(words.caUnreadable);
    }
  }
  // A database anywhere else must have its certificate checked (L2).
  for (const [name, value] of Object.entries(addresses)) {
    if (addressOnThisComputer(value) !== true && (ssl !== 'verify' || caFile === undefined)) {
      problems.push(words.certificateNotChecked(name));
    }
  }

  if (problems.length > 0) return { problems };
  const options = ca === undefined ? { ssl } : { ssl, ca };
  return {
    source: {
      kind: 'hosted',
      migration: { url: addresses[migrationSetting], ...options },
      app: { url: addresses[appSetting], ...options },
    },
  };
}
