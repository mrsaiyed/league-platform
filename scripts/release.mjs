// `npm run release`: applies the database changes of this checkout, then names the commit
// to deploy (step 2.95, record 101, T-48, T-49). Run by a person at their own terminal: on
// the test copy with --hosted and the migration login given for this one command, as
// `league:make --hosted` is; that login is never a setting on the host (2.110, M11).
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
import { codeOf, runRelease } from './release-run.mjs';
import { releaseSourceFor } from './release-source.mjs';
import * as words from './release.messages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let values;
try {
  ({ values } = parseArgs({
    options: {
      db: { type: 'string' },
      hosted: { type: 'boolean', default: false },
      migrations: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
    strict: true,
  }));
} catch (error) {
  // Node's words name the option it did not take, which the person typed themselves.
  console.error(error instanceof Error ? error.message : String(error));
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

const prompt = terminal ? createInterface({ input: process.stdin, output: process.stdout }) : null;
const stoppedAtQuestion = new Error('stopped at the question');
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
    source: chosen.source,
    commit,
    ask,
    folder: values.migrations === undefined ? undefined : path.resolve(values.migrations),
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
