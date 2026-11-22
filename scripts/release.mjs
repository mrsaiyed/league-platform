// `npm run release`: applies the database changes of this checkout, then names the commit
// to deploy (step 2.95, record 101, T-48, T-49). Run by a person at their own terminal: on
// the test copy with --hosted and the migration login's address given for this one
// command, WITHOUT its password, which is asked for here with the typing hidden (T-300);
// that login is never a setting on the host (2.110, M11). An address with a password, in
// MIGRATION_DATABASE_URL or as an argument, is refused in a sentence that repeats none of it.
// A thin script: where it acts is decided in release-source.mjs, the run is in
// release-run.mjs, the words in release.messages.mjs. Ctrl+C at the question stops it
// with nothing applied.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { trackerProjectFor } from '@srleagues/providers';
import { addressCarriesPassword, askHidden, withPassword } from './release-password.mjs';
import { codeOf, runRelease } from './release-run.mjs';
import { releaseSourceFor } from './release-source.mjs';
import * as words from './release.messages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Before anything reads the arguments: an address with its password typed on the command
// line is in the shell's history now, and is never repeated (review L1).
if (process.argv.slice(2).some(addressCarriesPassword)) {
  console.error(words.passwordInAddress);
  process.exit(2);
}

let values;
try {
  ({ values } = parseArgs({
    options: {
      db: { type: 'string' },
      'go-ahead': { type: 'boolean', default: false },
      hosted: { type: 'boolean', default: false },
      migrations: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
    strict: true,
  }));
} catch {
  // Node's words repeat what was typed, which may be a secret: never printed.
  console.error(words.notUnderstood);
  console.error(words.usage);
  process.exit(2);
}
if (values.help) {
  console.log(words.usage);
  process.exit(0);
}
if (values.hosted && values.migrations !== undefined) {
  console.error(words.migrationsNeedFolder);
  process.exit(2);
}

/** This checkout's commit, refused when supabase/migrations differs from it. */
function commit() {
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    const id = git('rev-parse', 'HEAD').trim();
    const changed = git(
      'status',
      '--porcelain',
      '--untracked-files=all',
      '--',
      'supabase/migrations',
    );
    return changed.trim() === '' ? { ok: true, id } : { ok: false, problem: 'migrations-changed' };
  } catch {
    return { ok: false, problem: 'not-a-checkout' };
  }
}

const terminal = process.stdin.isTTY === true;
const chosen = releaseSourceFor({
  hosted: values.hosted,
  db: values.db,
  env: process.env,
  envFileText: existsSync(path.join(root, '.env'))
    ? readFileSync(path.join(root, '.env'), 'utf8')
    : undefined,
  terminal,
  root,
  trackerProject: trackerProjectFor(import.meta.url),
});
if ('problems' in chosen) {
  for (const line of chosen.problems) console.error(line);
  process.exit(2);
}
if (chosen.note !== undefined) console.log(chosen.note);

const stoppedAtQuestion = new Error('stopped at the question');
let source = chosen.source;
if (chosen.askPassword === true) {
  // Asked before the line reader below takes the terminal: raw mode, nothing echoed.
  let password;
  try {
    password = await askHidden({
      input: process.stdin,
      output: process.stdout,
      question: words.passwordQuestion,
      stopped: stoppedAtQuestion,
    });
  } catch {
    console.log(words.stopped);
    process.exit(130);
  }
  if (password === '' && chosen.local !== true) {
    console.error(words.noPasswordTyped);
    process.exit(2);
  }
  source = {
    ...source,
    migration: { ...source.migration, url: withPassword(source.migration.url, password) },
  };
}

const prompt = terminal ? createInterface({ input: process.stdin, output: process.stdout }) : null;
async function ask(question) {
  if (prompt === null) return '';
  const controller = new AbortController();
  const stop = () => controller.abort();
  prompt.once('SIGINT', stop);
  try {
    return await prompt.question(question, { signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw stoppedAtQuestion;
    throw error;
  } finally {
    prompt.off('SIGINT', stop);
  }
}

let exitCode = 1;
try {
  exitCode = await runRelease({
    source,
    commit,
    ask,
    folder: values.migrations === undefined ? undefined : path.resolve(values.migrations),
    goAhead: values['go-ahead'],
  });
} catch (error) {
  if (error === stoppedAtQuestion) {
    console.log('');
    console.log(words.stopped);
    exitCode = 130;
  } else {
    console.error(words.unexpected(codeOf(error)));
  }
} finally {
  prompt?.close();
}
process.exit(exitCode);
