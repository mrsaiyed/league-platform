// `npm run league:make`: makes a league in draft with its first season as the current
// one (step 2.125 part 1, P3 §8, record 057), the internal version of the four steps
// of P3 §1 for our own staff. A thin script: it reads its options and the migration
// login's settings, asks for anything missing, shows the plan and asks before making
// anything. packages/core checks the answers (planNewLeague) and packages/database
// makes the league through the product's own commands (makeLeague).
//
// Where: --db <folder> if given; otherwise the migration login's database,
// MIGRATION_DATABASE_URL; otherwise the local test database in .local/seed-db.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { leagueUrl, planNewLeague, seasonPartOf } from '@srleagues/core';
import { makeLeague, openLeagueMakingTarget, previewNewLeague } from '@srleagues/database';
import * as words from './make-league.messages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let values;
try {
  ({ values } = parseArgs({
    options: {
      name: { type: 'string' },
      'short-name': { type: 'string' },
      sport: { type: 'string' },
      'who-plays': { type: 'string' },
      city: { type: 'string' },
      'time-zone': { type: 'string' },
      'contact-email': { type: 'string' },
      'owner-email': { type: 'string' },
      season: { type: 'string' },
      as: { type: 'string' },
      db: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
    strict: true,
  }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(words.usage);
  process.exit(2);
}
if (values.help) {
  console.log(words.usage);
  process.exit(0);
}

const today = new Date().toISOString().slice(0, 10);
const suggested = seasonPartOf(today);
const answers = {
  name: values.name,
  shortName: values['short-name'],
  sport: values.sport,
  whoPlays: values['who-plays'],
  city: values.city,
  timeZone: values['time-zone'],
  contactEmail: values['contact-email'],
  ownerEmail: values['owner-email'],
  seasonName: values.season,
  staffEmail: values.as,
};
const defaults = {
  sport: 'basketball',
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  seasonName: `${words.seasonPartNames[suggested.part]} ${suggested.year}`,
};

const terminal = process.stdin.isTTY === true;
const prompt = terminal ? createInterface({ input: process.stdin, output: process.stdout }) : null;
const close = () => prompt?.close();

for (const field of Object.keys(words.questions)) {
  if (answers[field] !== undefined && answers[field].trim() !== '') continue;
  if (prompt === null) {
    if (defaults[field] !== undefined) answers[field] = defaults[field];
    continue;
  }
  const question = words.questions[field];
  const fallback = defaults[field];
  const typed = (
    await prompt.question(
      fallback === undefined
        ? words.plainQuestion(question)
        : words.withDefault(question, fallback),
    )
  ).trim();
  answers[field] = typed === '' ? fallback : typed;
}

const { staffEmail, ...leagueAnswers } = answers;
const planned = planNewLeague(leagueAnswers);
const problems = planned.ok ? [] : planned.problems;
const lines = problems.map(({ field, problem }) =>
  problem === 'missing' ? words.problemWords.missing(field) : words.problemWords[problem][field],
);
const staff = staffEmail?.trim() ?? '';
if (staff === '') lines.push(words.missingStaff);
else if (!/^[^@\s]+@[^@\s]+$/u.test(staff)) lines.push(words.badStaff);
if (lines.length > 0) {
  close();
  if (!terminal && problems.some((p) => p.problem === 'missing'))
    console.error(words.notInteractive);
  for (const line of lines) console.error(line);
  process.exit(2);
}
const plan = planned.plan;
const address = leagueUrl(plan, 'home');

function sourceFromSettings() {
  if (values.db !== undefined) return { kind: 'folder', folder: values.db };
  const url = process.env.MIGRATION_DATABASE_URL?.trim();
  if (url === undefined || url === '') {
    return { kind: 'folder', folder: path.join(root, '.local', 'seed-db') };
  }
  const ssl = process.env.MIGRATION_DATABASE_SSL?.trim() || 'verify';
  if (!['verify', 'no-verify', 'off'].includes(ssl)) throw new Error(words.badSsl);
  const caFile = process.env.MIGRATION_DATABASE_CA?.trim();
  let ca;
  if (caFile) {
    try {
      ca = readFileSync(caFile, 'utf8');
    } catch {
      throw new Error(words.caUnreadable);
    }
  }
  return ca === undefined ? { kind: 'postgres', url, ssl } : { kind: 'postgres', url, ssl, ca };
}

let source;
try {
  source = sourceFromSettings();
} catch (error) {
  close();
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

const opened = await openLeagueMakingTarget(source);
if (!opened.ok) {
  close();
  console.error(words.targetProblems[opened.problem]);
  process.exit(1);
}
const { target } = opened;
let exitCode = 0;
try {
  const preview = await previewNewLeague(target, plan, staff);
  if (!preview.schemaReady || preview.shortNameHeld) {
    console.error(words.makeProblems[preview.schemaReady ? 'short-name-held' : 'schema-not-ready']);
    exitCode = 1;
  } else {
    for (const line of words.planLines(plan, preview, target.place, staff, address))
      console.log(line);
    if (prompt === null) console.log(words.needsTerminal);
    const answer = prompt === null ? '' : (await prompt.question(words.confirm)).trim();
    if (answer.toLowerCase() !== 'yes') {
      console.log(words.notMade);
      exitCode = 1;
    } else {
      const outcome = await makeLeague(target, plan, { staffEmail: staff });
      if (outcome.ok) {
        for (const line of words.made(outcome.made, plan, address)) console.log(line);
      } else {
        console.error(
          outcome.problem.kind === 'refused'
            ? words.refused(outcome.problem)
            : words.makeProblems[outcome.problem.kind],
        );
        exitCode = 1;
      }
    }
  }
} finally {
  close();
  await target.close();
}
process.exit(exitCode);
