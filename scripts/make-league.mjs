// `npm run league:make`: makes a league in draft with its first season as the current
// one, in one step (step 2.125 part 1, P3 §8, record 057), the internal version of the
// four steps of P3 §1 for our own staff. A thin script: it reads its options and the
// migration login's settings, asks for anything missing, shows the plan and asks
// before making anything. packages/core checks the answers (planNewLeague) and
// packages/database makes the league through the product's own commands (makeLeague).
//
// Where: on this computer unless told otherwise (make-league-source.mjs): --db
// <folder>, or the local test database in .local/seed-db. --hosted, only at a
// terminal, uses a hosted database through two logins, each address first passing the
// tracker's database guard. The target is opened and described in one place
// (openLeagueMakingTarget), and the question is asked in one place (askToMake,
// below): on a hosted database it is answered by typing the league's short name.
// Ctrl+C at any question stops it cleanly, with nothing made.
//
// Whatever goes wrong, it says in plain words what was and was not made, never prints
// an error's message (it can repeat an address with its login), and exits non-zero.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { leagueUrl, namedTimeZone, planNewLeague, suggestedSeason } from '@srleagues/core';
import { makeLeague, openLeagueMakingTarget, previewNewLeague } from '@srleagues/database';
import { trackerProjectFor } from '@srleagues/providers';
import { answerGoesAhead, sourceFor } from './make-league-source.mjs';
import * as words from './make-league.messages.mjs';

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
      name: { type: 'string' },
      'short-name': { type: 'string' },
      sport: { type: 'string' },
      'who-plays': { type: 'string' },
      listed: { type: 'string' },
      city: { type: 'string' },
      'time-zone': { type: 'string' },
      'contact-email': { type: 'string' },
      'owner-email': { type: 'string' },
      season: { type: 'string' },
      'season-starts': { type: 'string' },
      'season-ends': { type: 'string' },
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

const answers = {
  name: values.name,
  shortName: values['short-name'],
  sport: values.sport,
  whoPlays: values['who-plays'],
  listed: values.listed,
  city: values.city,
  timeZone: values['time-zone'],
  contactEmail: values['contact-email'],
  ownerEmail: values['owner-email'],
  seasonName: values.season,
  seasonStartsOn: values['season-starts'],
  seasonEndsOn: values['season-ends'],
  staffEmail: values.as,
};

const computerZone = () => namedTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);

/** Suggestions, worked out when asked: the season goes by the league's own date. */
const defaults = {
  sport: () => 'basketball',
  timeZone: () => computerZone(),
  seasonName: () => {
    const zone = namedTimeZone(answers.timeZone ?? '') ?? computerZone() ?? 'UTC';
    return words.seasonName(suggestedSeason(Date.now(), zone));
  },
};
/** Asked at a terminal, but Enter leaves them out. */
const optional = new Set(['seasonStartsOn', 'seasonEndsOn']);

const terminal = process.stdin.isTTY === true;
const prompt = terminal ? createInterface({ input: process.stdin, output: process.stdout }) : null;

/** Thrown when Ctrl+C is pressed at a question: the run stops, with nothing made. */
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

/**
 * The one place the tool asks whether to make it, only at a terminal: "yes" (any
 * capitals) on this computer, the league's exact short name on a hosted database.
 */
async function askToMake(plan, hosted, place) {
  if (prompt === null) {
    console.log(words.needsTerminal);
    return false;
  }
  // On a hosted database the person checks where it is, then types the short name
  // from the plan: the question does not print the answer.
  if (hosted) for (const line of words.checkBeforeAnswering(place)) console.log(line);
  const answer = await ask(hosted ? words.confirmHosted : words.confirm);
  return answerGoesAhead(answer, { hosted, slug: plan.slug });
}

async function askForMissing() {
  for (const field of Object.keys(words.questions)) {
    if (answers[field] !== undefined && answers[field].trim() !== '') continue;
    const fallback = defaults[field]?.();
    if (prompt === null) {
      if (fallback !== undefined && !optional.has(field)) answers[field] = fallback;
      continue;
    }
    const question = words.questions[field];
    const typed = (
      await ask(
        fallback === undefined
          ? words.plainQuestion(question)
          : words.withDefault(question, fallback),
      )
    ).trim();
    answers[field] = typed === '' ? fallback : typed;
  }
}

/** The run: its exit code. `stage.making` is set once anything may have been made. */
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
  const planned = planNewLeague(answers);
  if (!planned.ok) {
    if (!terminal && planned.problems.some((p) => p.problem === 'missing'))
      console.error(words.notInteractive);
    for (const { field, problem } of planned.problems) {
      console.error(
        problem === 'missing'
          ? words.problemWords.missing(field)
          : words.problemWords[problem][field],
      );
    }
    return 2;
  }
  const plan = planned.plan;
  const address = leagueUrl(plan, 'home');

  const opened = await openLeagueMakingTarget(source);
  if (!opened.ok) {
    for (const line of words.targetProblemLines(opened.problem)) console.error(line);
    return 1;
  }
  const { target } = opened;
  stage.close = () => target.close();

  const preview = await previewNewLeague(target, plan);
  if (!preview.ready) {
    for (const line of words.readinessLines(preview.problem)) console.error(line);
    return 1;
  }
  if (preview.shortNameHeld) {
    console.error(words.shortNameHeld);
    return 1;
  }
  for (const line of words.planLines(plan, preview, target.place, address)) console.log(line);
  if (!(await askToMake(plan, source.kind === 'hosted', target.place))) {
    console.log(words.notMade);
    return 1;
  }

  stage.making = true;
  const outcome = await makeLeague(target, plan);
  if (outcome.ok) {
    for (const line of words.made(outcome.made, plan, address)) console.log(line);
    return 0;
  }
  for (const line of words.makeProblemLines(outcome.problem, outcome.accounts)) console.error(line);
  return 1;
}

const stage = { making: false, close: async () => {} };
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
    console.error(stage.making ? words.unexpectedWhileMaking(code) : words.unexpected(code));
    exitCode = 1;
  }
} finally {
  prompt?.close();
  try {
    await stage.close();
  } catch {
    // Closing cannot change what was made, and its error may name the address.
  }
}
process.exit(exitCode);
