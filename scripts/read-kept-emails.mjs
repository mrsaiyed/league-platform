// `node scripts/read-kept-emails.mjs --hosted --to <made-up address>` (step 2.204, record
// 075 option 5, record 098): prints the newest sign-in code, or else the newest link, kept
// on the test copy ("staging") for one made-up address, to the terminal and nothing else.
// For the lead, in a session the founder started, with the test copy's two logins given
// for this one command (T-201); never an unattended run or a builder.
//
// Where it reads is read-kept-emails-source.mjs: the same source, guards and terminal rule
// as `npm run league:make --hosted`. With no --hosted it reads a PGlite folder on this
// computer (--db, or .local/seed-db), for tests. It changes nothing. It never prints an
// error's message (it can repeat an address with its login), only its short code, and it
// prints the address asked about nowhere. How to use it: docs/operations/reading-test-copy-codes.md.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { trackerProjectFor } from '@srleagues/providers';
import * as makeWords from './make-league.messages.mjs';
import { keptEmailsSourceFor, readNewestKept } from './read-kept-emails-source.mjs';
import * as words from './read-kept-emails.messages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A short error code only (SQLSTATE such as 42501, or ECONNRESET), never a message. */
function codeOf(error) {
  const code = typeof error === 'object' && error !== null ? error.code : undefined;
  return typeof code === 'string' && /^[A-Z0-9_]{2,24}$/.test(code) ? code : undefined;
}

async function run() {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        hosted: { type: 'boolean', default: false },
        db: { type: 'string' },
        to: { type: 'string' },
      },
      strict: true,
    }));
  } catch {
    console.error(words.usage);
    return 2;
  }
  // A terminal both ways: the answer is read by a person, never piped into a file or a log.
  const terminal = process.stdin.isTTY === true && process.stdout.isTTY === true;
  const envFile = path.join(root, '.env');
  const chosen = keptEmailsSourceFor({
    to: values.to,
    hosted: values.hosted,
    db: values.db,
    env: process.env,
    envFileText: existsSync(envFile) ? readFileSync(envFile, 'utf8') : undefined,
    terminal,
    root,
    trackerProject: trackerProjectFor(import.meta.url),
  });
  if ('problems' in chosen) {
    for (const line of chosen.problems) console.error(line);
    return 2;
  }
  if (chosen.note !== undefined) console.error(chosen.note);
  const read = await readNewestKept(chosen.source, chosen.to);
  if ('targetProblem' in read) {
    for (const line of makeWords.targetProblemLines(read.targetProblem)) console.error(line);
    return 1;
  }
  if ('problem' in read) {
    const lines = {
      'none-kept': words.noneKept,
      'nothing-to-read': words.nothingToRead,
      'not-migrated': words.notYetMigrated,
    };
    console.error(lines[read.problem]);
    return 1;
  }
  // The one line it prints: the code or the link, nothing else.
  process.stdout.write(`${read.answer}\n`);
  return 0;
}

let exitCode = 1;
try {
  exitCode = await run();
} catch (error) {
  console.error(words.unexpected(codeOf(error)));
  exitCode = 1;
}
process.exitCode = exitCode;
