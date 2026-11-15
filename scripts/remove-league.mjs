// `npm run league:remove`: removes a league made by mistake with `npm run league:make`
// (step 2.150, record 063), its twin with the same safety. A thin script: it reads
// its options and the logins' settings, asks for anything missing, shows the plan and
// asks before removing anything. packages/database removes the league through the
// product's own command (removeLeague, removeDraftLeague in core).
//
// Where: decided by the twin's own code (make-league-source.mjs), so the same guard
// runs before anything connects: on this computer unless told otherwise; --hosted
// only at a terminal, through the two logins, each address first passing the
// tracker's database guard, the certificate checked for a database elsewhere. The
// target is opened and described by the twin's openLeagueMakingTarget. The question
// is always answered by typing the league's short name, here as on a hosted database.
// Ctrl+C at any question stops it cleanly, with nothing removed.
//
// Whatever goes wrong, it says in plain words what was and was not removed, never
// prints an error's message (it can repeat an address with its login), and exits
// non-zero.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { openLeagueMakingTarget, previewLeagueRemoval, removeLeague } from '@srleagues/database';
import { trackerProjectFor } from '@srleagues/providers';
import { answerGoesAhead, sourceFor } from './make-league-source.mjs';
import * as words from './remove-league.messages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A short error code only (SQLSTATE such as 23505, or ECONNRESET), never a message. */
function codeOf(error) {
  const code = typeof error === 'object' && error !== null ? error.code : undefined;
  return typeof code === 'string' && /^[A-Z0-9_]{2,24}$/.test(code) ? code : undefined;
}

let values;
try {
  ({ values } = parseArgs({
    options: {
      'short-name': { type: 'string' },
      as: { type: 'string' },
      db: { type: 'string' },
      hosted: { type: 'boolean', default: false },
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

const answers = { shortName: values['short-name'], staffEmail: values.as };

const terminal = process.stdin.isTTY === true;
const prompt = terminal ? createInterface({ input: process.stdin, output: process.stdout }) : null;

/** Thrown when Ctrl+C is pressed at a question: the run stops, with nothing removed. */
const stoppedAtQuestion = new Error('stopped at a question');
let stopQuestion = () => {};
prompt?.on('SIGINT', () => stopQuestion());

/** One question at the terminal; Ctrl+C stops the run. */
async function ask(question) {
  const controller = new AbortController();
  stopQuestion = () => controller.abort();
  try {
    return await prompt.question(question, { signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw stoppedAtQuestion;
    throw error;
  } finally {
    stopQuestion = () => {};
  }
}

/** The one place the tool asks whether to remove it: the league's exact short name. */
async function askToRemove(slug, hosted, place) {
  if (prompt === null) {
    console.log(words.needsTerminal);
    return undefined;
  }
  // The person checks where it is, then types the short name from the plan: the
  // question does not print the answer.
  if (hosted) for (const line of words.checkBeforeAnswering(place)) console.log(line);
  const typed = await ask(words.confirm);
  // The same rule as the twin's hosted question: only the exact short name goes on.
  return answerGoesAhead(typed, { hosted: true, slug }) ? typed.trim() : null;
}

async function askForMissing() {
  for (const field of Object.keys(words.questions)) {
    if (answers[field] !== undefined && answers[field].trim() !== '') continue;
    if (prompt === null) continue;
    answers[field] = (await ask(words.plainQuestion(words.questions[field]))).trim();
  }
}

/** The run: its exit code. `stage.removing` is set once anything may have been removed. */
async function run(stage) {
  // Where, before any question: a hosted database with no terminal opens nothing.
  const envFile = path.join(root, '.env');
  const chosen = sourceFor({
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
  if (chosen.note !== undefined) console.log(chosen.note);
  const { source } = chosen;

  await askForMissing();
  const missing = Object.keys(words.questions).filter(
    (field) => answers[field] === undefined || answers[field].trim() === '',
  );
  if (missing.length > 0) {
    if (!terminal) console.error(words.notInteractive);
    for (const field of missing) console.error(words.missing(field));
    return 2;
  }
  const request = { slug: answers.shortName.trim(), staffEmail: answers.staffEmail.trim() };

  const opened = await openLeagueMakingTarget(source);
  if (!opened.ok) {
    for (const line of words.targetProblemLines(opened.problem)) console.error(line);
    return 1;
  }
  const { target } = opened;
  stage.close = () => target.close();

  const preview = await previewLeagueRemoval(target, request);
  if (!preview.ready) {
    for (const line of words.readinessLines(preview.problem)) console.error(line);
    return 1;
  }
  if (preview.league === undefined) {
    console.error(words.notFound(request.slug));
    return 1;
  }
  if (preview.league.problems.length > 0) {
    for (const line of words.inUseLines(preview.league, preview.league.problems)) {
      console.error(line);
    }
    return 1;
  }
  if (preview.staffAccountId === undefined) {
    console.error(words.staffUnknown(request.staffEmail));
    return 1;
  }
  for (const line of words.planLines(preview, target.place)) console.log(line);
  const typed = await askToRemove(preview.league.slug, source.kind === 'hosted', target.place);
  if (typed === undefined) {
    console.log(words.notRemoved);
    return 1;
  }
  if (typed === null) {
    console.log(words.typedWrong);
    return 1;
  }

  stage.removing = true;
  const outcome = await removeLeague(target, { ...request, typedSlug: typed });
  if (outcome.ok) {
    for (const line of words.removedLines(outcome.removed, request.staffEmail)) console.log(line);
    return 0;
  }
  for (const line of words.removeProblemLines(outcome.problem, request)) console.error(line);
  return 1;
}

const stage = { removing: false, close: async () => {} };
let exitCode = 1;
try {
  exitCode = await run(stage);
} catch (error) {
  if (error === stoppedAtQuestion) {
    console.log('');
    console.log(words.stopped);
    exitCode = 130;
  } else {
    const code = codeOf(error);
    console.error(stage.removing ? words.unexpectedWhileRemoving(code) : words.unexpected(code));
    exitCode = 1;
  }
} finally {
  prompt?.close();
  try {
    await stage.close();
  } catch {
    // Closing cannot change what was removed, and its error may name the address.
  }
}
process.exit(exitCode);
