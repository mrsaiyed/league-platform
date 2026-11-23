#!/usr/bin/env node
// The two-league test's standing check (step 2.224, data audit finding D-M1, T-65, T-294).
//
// The two-league test (packages/database/src/isolation) is meant to prove that every
// query names its league. This proves the test can: it takes each league filter out of
// a query, one filter at a time, runs that query's own cases (the groups named for the
// functions the file exports), and expects them to FAIL ON THEIR ASSERTION. A filter
// whose removal the cases do not notice is a gap in the test: the check fails and names it.
//
// It never changes a file of the repository: every run works in a temporary copy of
// packages/database (and the migrations) under the system's temp folder, beside links to
// the repository's other packages and node_modules. The copy is removed afterwards, also
// on Ctrl-C or a stop signal; a copy left by a killed run holds nothing tracked.
//
//   node scripts/fence-filter-check.mjs                     every query file and both read stores
//   node scripts/fence-filter-check.mjs purge-binned …      only these files (names without .ts)
//   node scripts/fence-filter-check.mjs list-binned#1 …     only these filters (as --list names them)
//   node scripts/fence-filter-check.mjs --list              the filters it would take out, no runs
//   node scripts/fence-filter-check.mjs --excused           the reviewed excused list
//   --jobs=N                                                 N filters at a time, each in its own copy
//
// Each filter is one test process (about ten seconds), so the whole sweep takes 30 to 45
// minutes: it is not in the gate (T-294). The named gaps run in `npm test`
// (tests/fence-filter-check.test.mjs); the whole sweep is a GitHub job (step 2.224, part 2).
import { spawn } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verdictOf } from './fence-filter-verdict.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const casesTest = 'packages/database/src/isolation/isolation-cases.test.ts';
const vitest = join(root, 'node_modules', '.bin', 'vitest');
const groupTitle = (subject) => `no case of '${subject}' reaches another league`;

/**
 * Filters the check may leave in, each with its reason. Reviewed: keep it short, and add
 * to it only with the reason a filter's removal cannot reach another league. The check
 * fails if a listed filter is in fact caught (the excuse is stale) or if the list grows
 * past `mostExcused` without that number being changed in the same review.
 * Key: `<file>.ts#<n>`, n counting the file's filters from 1 as `--list` prints them.
 */
const excused = new Map([
  // The purge's teams: #3 picks the binned teams nothing points at, and each of #4 to #6
  // removes only teams (and their rows) of those ids AND names the league again, so with
  // any one of the four taken out the others still keep another league's teams in place.
  ['purge-binned.ts#3', 'its ids feed only #4 to #6, each of which names the league too'],
  ['purge-binned.ts#4', "keyed by the team ids #3's league-filtered read chose"],
  ['purge-binned.ts#5', "keyed by the team ids #3's league-filtered read chose"],
  ['purge-binned.ts#6', "keyed by the team ids #3's league-filtered read chose"],
  // Step 2.224, part 2: filters that only repeat another filter of the same statement.
  // Every row names its league with the season or game it belongs to (the composite
  // foreign keys teams_season, games_season, rounds_season, game_assignments_game), so
  // with any one of these taken out the statement's other league filter still holds.
  ['games-for-lists.ts#2', "keyed by g.id, the game #3 and #4 hold to the scope's league"],
  ['games-for-lists.ts#3', "the join's s.league_id = g.league_id and #4 still hold the game"],
  ['games-for-lists.ts#4', "the join's s.league_id = g.league_id and #3 still hold the season"],
  ['games-for-lists.ts#5', "keyed by g.id, the game #3 and #4 hold to the scope's league"],
  ['list-earlier-rounds.ts#1', "keyed by g.id, the game #2 and #3 hold to the scope's league"],
  ['list-earlier-rounds.ts#2', "the join's s.league_id = g.league_id and #3 still hold the game"],
  ['list-earlier-rounds.ts#3', "the join's s.league_id = g.league_id and #2 still hold the season"],
  // findPublicSeason (its filter checked in its own file) answers first and the rounds are
  // read only for a season it found; rounds_season ties each round to its season's league.
  [
    'list-public-schedule.ts#1',
    'read only for a season the league-filtered findPublicSeason found',
  ],
  ['list-season-teams.ts#1', "#3 keeps the season to the scope's league; teams_season the rest"],
  ['list-season-teams.ts#2', 'keyed by teams.id and season_id, which #1 and #3 hold'],
  ['remove-table-player.ts#4', 'only narrows which entries keep a person #3 holds to the league'],
  ['list-season-teams.ts#3', "#1 keeps the teams to the scope's league; teams_season the rest"],
  // Whole files with no league filter of their own (keyed by the file name alone): the
  // check has nothing to take out, and each says why. A new file with no filter of a
  // known shape and no reason here is a problem of the check, also with --list.
  ...wholeFiles(
    'runs no SQL of its own: it shapes rows other queries read, or names a constraint',
    'access-rows.ts',
    'constraint-of.ts',
    'division-summary.ts',
    'game-summary.ts',
    'league-status-of.ts',
    'person-summary.ts',
    'program-summary.ts',
    'roster-entry-summary.ts',
    'scoring-session-summary.ts',
    'team-summary.ts',
    'venue-summary.ts',
  ),
  ...wholeFiles(
    'an SQL piece the people queries select, joined to their rows; their filters are checked',
    'minor-by-age-sql.ts',
  ),
  ...wholeFiles('reads no table: a savepoint around another write', 'in-savepoint.ts'),
  ...wholeFiles(
    "reads no row: a lock whose key names the scope's league and season",
    'lock-season-standings.ts',
  ),
  ...wholeFiles(
    'an insert writes the league as a value, not a filter, and the fence (with check' +
      ' league_id = current_league_id(), 0005 and on) refuses a row of any other league',
    'insert-activity.ts',
    'insert-court.ts',
    'insert-division.ts',
    'insert-game-assignment.ts',
    'insert-game-correction.ts',
    'insert-game-events.ts',
    'insert-invitation.ts',
    'insert-job.ts',
    'insert-person.ts',
    'insert-role-grant.ts',
    'insert-rounds.ts',
    'insert-scoring-session.ts',
    'insert-season.ts',
    'insert-site-release.ts',
    'insert-standings-adjustment.ts',
    'insert-team.ts',
    'insert-venue.ts',
    'save-game-state.ts',
  ),
  ...wholeFiles(
    'makes a new league and its first rows: no league is set yet to filter by',
    'insert-league.ts',
  ),
  ...wholeFiles(
    'before or beside any league by design, through a narrow database function that' +
      ' answers only for the account or name it is given (record 008)',
    'account-for-sign-in.ts',
    'create-own-profile.ts',
    'erase-account.ts',
    'find-account-of-sign-in.ts',
    'find-league-by-short-name.ts',
    'list-my-leagues.ts',
    'take-jobs.ts',
  ),
  ...wholeFiles(
    "the league is the transaction's own, inside public.access_list_names (0012)",
    'list-access-names.ts',
  ),
  ...wholeFiles(
    'the league is an argument of a database function, whose filter is in its migration',
    'game-has-plays.ts',
    'game-was-decided.ts',
  ),
  ...wholeFiles(
    'reads only through other query files, whose filters are checked there with these cases',
    'games-read-store.ts',
    'list-earlier-round.ts',
    'list-games-by-ids.ts',
    'list-games-needing-result.ts',
    'standings-read-store.ts',
  ),
]);
// 4 of the purge, 12 repeated filters and 48 files with no filter of their own (2.224).
const mostExcused = 64;

/** Whole-file excuses: each file name with the one reason. */
function wholeFiles(reason, ...files) {
  return files.map((file) => [file, reason]);
}

/** What a league filter looks like, and what is left when it is taken out. */
const shapes = [
  // .where('league_id', '=', scope.leagueId), .where('t.league_id', '=', leagueId)
  { pattern: /\n?[ \t]*\.where\(\s*'(?:\w+\.)?league_id',\s*'=',\s*[\w.]+\s*\)/g, gone: '' },
  // the leagues table itself: .where('id', '=', scope.leagueId)
  { pattern: /\n?[ \t]*\.where\(\s*'(?:\w+\.)?id',\s*'=',\s*scope\.leagueId\s*\)/g, gone: '' },
  // SQL text: t.league_id = ${scope.leagueId}, league_id = ${league}
  { pattern: /\b(?:\w+\.)?league_id\s*=\s*\$\{[^}]+\}/g, gone: 'true' },
];

function filtersIn(text) {
  const found = [];
  for (const { pattern, gone } of shapes) {
    for (const match of text.matchAll(pattern)) {
      found.push({ at: match.index, length: match[0].length, text: match[0].trim(), gone });
    }
  }
  return found.sort((x, y) => x.at - y.at);
}

function exportedNames(text) {
  return [...text.matchAll(/export (?:async )?(?:function\*? |const )(\w+)/g)].map((m) => m[1]);
}

const allFiles = () => [
  ...readdirSync(join(root, 'packages/database/src/queries'))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'index.ts')
    .map((f) => `packages/database/src/queries/${f}`),
  ...['games-read-store.ts', 'standings-read-store.ts'].map(
    (f) => `packages/database/src/stores/${f}`,
  ),
];

/** The files to check, each with the filter numbers asked for (null: all of them). */
function filesToCheck(names) {
  const all = allFiles();
  if (names.length === 0) return all.map((file) => ({ file, only: null }));
  const asked = new Map();
  for (const name of names) {
    const [base, n] = name.replace(/\.ts(?=#|$)/, '').split('#');
    const file = all.find((f) => f.endsWith(`/${base}.ts`));
    if (file === undefined) throw new Error(`no query or read store named ${base}`);
    const only = asked.has(file) ? asked.get(file) : n === undefined ? null : new Set();
    if (only !== null && n !== undefined) only.add(Number(n));
    asked.set(file, n === undefined ? null : only);
  }
  return [...asked].map(([file, only]) => ({ file, only }));
}

/** The read stores whose cases also run a query: each store's file names the query. */
const readStores = new Map(
  [
    ['gamesReadStore', 'games-read-store.ts'],
    ['standingsReadStore', 'standings-read-store.ts'],
  ].map(([store, file]) => [
    store,
    readFileSync(join(root, 'packages/database/src/stores', file), 'utf8'),
  ]),
);

/** A file's own subjects, and each read store that calls one of them. */
function subjectsOf(text) {
  const own = exportedNames(text);
  const stores = [...readStores]
    .filter(([store, body]) => !own.includes(store) && own.some((n) => body.includes(n)))
    .map(([store]) => store);
  return [...own, ...stores];
}

const escaped = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// --- The temporary copies, and their removal whatever ends the run. ---

const copies = new Set();
const children = new Set();

function removeCopies() {
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      // Already gone.
    }
  }
  for (const dir of copies) rmSync(dir, { recursive: true, force: true });
  copies.clear();
}

for (const [signal, code] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
  ['SIGHUP', 129],
]) {
  process.on(signal, () => {
    removeCopies();
    console.error(`\nStopped (${signal}); the temporary copies are removed.`);
    process.exit(code);
  });
}
process.on('exit', removeCopies);

/** A copy the cases can run in: packages/database and the migrations, the rest linked. */
function makeCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'fence-filter-check-'));
  copies.add(dir);
  for (const file of [
    'package.json',
    'vitest.config.ts',
    'vitest.setup.ts',
    'vitest.reporter.ts',
    'tsconfig.base.json',
    'tsconfig.workspaces.json',
  ]) {
    cpSync(join(root, file), join(dir, file));
  }
  mkdirSync(join(dir, 'packages'));
  for (const entry of readdirSync(join(root, 'packages'))) {
    if (entry === 'database') continue;
    symlinkSync(join(root, 'packages', entry), join(dir, 'packages', entry), 'dir');
  }
  cpSync(join(root, 'packages/database'), join(dir, 'packages/database'), {
    recursive: true,
    filter: (source) => !source.split(/[\\/]/).includes('node_modules'),
  });
  cpSync(join(root, 'supabase/migrations'), join(dir, 'supabase/migrations'), {
    recursive: true,
  });
  symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
  return dir;
}

/**
 * Runs the groups of these subjects in a copy. For each subject: 'passed', 'caught' (its
 * group's assertion listed a leak: fence-filter-verdict.mjs), 'missing' (no such group ran) or 'error' (anything
 * else: a file that would not load, a thrown error, a crash or a timeout).
 */
function runGroups(dir, subjects) {
  const pattern = `no case of '(${subjects.map(escaped).join('|')})' reaches`;
  const report = join(dir, 'report.json');
  rmSync(report, { force: true });
  return new Promise((resolve) => {
    const child = spawn(
      vitest,
      ['run', casesTest, '-t', pattern, '--reporter=json', `--outputFile=${report}`],
      { cwd: dir, env: { ...process.env, CI: '1' }, detached: true, stdio: 'pipe' },
    );
    children.add(child);
    let out = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', (chunk) => (out += chunk));
    const limit = setTimeout(() => process.kill(-child.pid, 'SIGKILL'), 5 * 60 * 1000);
    child.on('close', () => {
      clearTimeout(limit);
      children.delete(child);
      let json;
      try {
        json = JSON.parse(readFileSync(report, 'utf8'));
      } catch {
        json = null;
      }
      const verdicts = new Map(subjects.map((subject) => [subject, 'missing']));
      const why = [];
      for (const file of json?.testResults ?? []) {
        if (file.status === 'failed' && file.assertionResults.every((t) => t.status !== 'failed'))
          why.push(file.message || 'the test file failed outside its tests');
        for (const test of file.assertionResults) {
          const subject = subjects.find((s) => test.title === groupTitle(s));
          if (subject === undefined) {
            if (test.status === 'failed') why.push(`${test.title}: ${test.failureMessages[0]}`);
            continue;
          }
          if (test.status === 'passed') verdicts.set(subject, 'passed');
          else if (test.status !== 'failed') continue;
          else {
            // Caught only when a leak is listed: a case that crashed is not caught.
            const { verdict, reason } = verdictOf(test.failureMessages);
            verdicts.set(subject, verdict);
            if (verdict === 'error') why.push(`${test.title}: ${reason}`);
          }
        }
      }
      if (json === null) why.push(out.trim().split('\n').slice(-5).join('\n'));
      // Anything wrong beside the groups (a file that would not load, a crash) makes
      // every verdict but a pass an error: a failure then proves nothing.
      if (why.length > 0) {
        for (const [subject, verdict] of verdicts) {
          if (verdict !== 'passed') verdicts.set(subject, 'error');
        }
      }
      resolve({ verdicts, why });
    });
  });
}

// --- The check. ---

const args = process.argv.slice(2);
const listOnly = args.includes('--list');
if (args.includes('--excused')) {
  // For tests/fence-filter-check.test.mjs: the reviewed list, one `key<TAB>reason` a line.
  for (const [key, reason] of excused) console.log(`${key}\t${reason}`);
  process.exit(0);
}
const jobs = Math.max(
  1,
  Number(/^--jobs=(\d+)$/.exec(args.find((a) => a.startsWith('--jobs=')) ?? '')?.[1] ?? 1),
);
const asked = filesToCheck(args.filter((a) => !a.startsWith('--')));

if (excused.size > mostExcused) {
  console.error(
    `The excused list has ${excused.size} entries, more than the reviewed ${mostExcused}.`,
  );
  process.exit(1);
}

const problems = [];
const tasks = [];
const subjectsByFile = new Map();
for (const { file, only } of asked) {
  const original = readFileSync(join(root, file), 'utf8');
  const name = file.split('/').pop();
  const filters = filtersIn(original);
  const fileExcuse = excused.get(name);
  if (filters.length === 0) {
    if (fileExcuse !== undefined) console.log(`${name}  excused: ${fileExcuse}`);
    else {
      console.log(`${name}: no league filter of a known shape (not checked)`);
      problems.push(
        `${name}: no league filter of a known shape, and no reason in the excused list`,
      );
    }
    continue;
  }
  if (fileExcuse !== undefined) {
    problems.push(
      `${name}: excused as having no filter, but has ${filters.length}: drop the excuse`,
    );
  }
  const subjects = subjectsOf(original);
  subjectsByFile.set(file, subjects);
  for (const [i, filter] of filters.entries()) {
    if (only !== null && !only.has(i + 1)) continue;
    const key = `${name}#${i + 1}`;
    if (listOnly) console.log(`${key}  ${filter.text}`);
    else tasks.push({ file, key, filter, subjects, original });
  }
  if (only !== null) {
    for (const n of only) {
      if (n < 1 || n > filters.length) problems.push(`${name}#${n}: the file has no such filter`);
    }
  }
}
if (listOnly) {
  for (const problem of problems) console.error(problem);
  process.exit(problems.length === 0 ? 0 : 1);
}

// The cases must pass as written first, or a failure with a filter gone proves nothing:
// one run for all the files' subjects together.
const first = makeCopy();
const asWritten = await runGroups(first, [...new Set([...subjectsByFile.values()].flat())]);
const ready = tasks.filter(({ file, subjects }) => {
  const notPassing = subjects.filter((s) => asWritten.verdicts.get(s) !== 'passed');
  // A subject with no group of its own (a helper the file exports) is fine while
  // another subject of the file has one that passes.
  const passing = subjects.some((s) => asWritten.verdicts.get(s) === 'passed');
  const broken = notPassing.filter((s) => asWritten.verdicts.get(s) !== 'missing');
  if (passing && broken.length === 0) return true;
  const name = file.split('/').pop();
  const message = `${name}: the cases of ${subjects.join(', ')} do not pass as written`;
  if (!problems.includes(message)) {
    console.log(`${name}: its cases do not pass as written (not checked)`);
    problems.push(message, ...asWritten.why);
  }
  return false;
});

let checked = 0;
const pool = [first, ...Array.from({ length: Math.min(jobs, ready.length) - 1 }, makeCopy)];
async function worker(dir) {
  for (let task = ready.shift(); task !== undefined; task = ready.shift()) {
    const { file, key, filter, subjects, original } = task;
    const path = join(dir, file);
    const started = Date.now();
    writeFileSync(
      path,
      original.slice(0, filter.at) + filter.gone + original.slice(filter.at + filter.length),
    );
    const { verdicts, why } = await runGroups(dir, subjects);
    writeFileSync(path, original);
    checked += 1;
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const seen = [...verdicts.values()];
    const verdict = seen.includes('error')
      ? 'error'
      : seen.includes('caught')
        ? 'caught'
        : seen.includes('passed')
          ? 'survived'
          : 'none';
    const excuse = excused.get(key);
    const label =
      verdict === 'caught'
        ? 'caught'
        : verdict === 'error'
          ? 'ERROR'
          : excuse !== undefined
            ? 'excused'
            : verdict === 'none'
              ? 'NO CASES'
              : 'SURVIVED';
    console.log(`${key}  ${label}  (${seconds}s)  ${filter.text}`);
    if (verdict === 'error') problems.push(`${key}: the run went wrong: ${why.join(' | ')}`);
    else if (verdict !== 'caught' && excuse === undefined) {
      problems.push(
        verdict === 'none'
          ? `${key}: no case of ${subjects.join(', ')} ran`
          : `${key}: its cases still pass with "${filter.text}" taken out`,
      );
    }
    if (verdict === 'caught' && excuse !== undefined)
      problems.push(`${key}: excused, but caught: drop the excuse`);
  }
}
await Promise.all(pool.map(worker));
removeCopies();

console.log(`\n${checked} filters taken out, ${problems.length} problems.`);
for (const problem of problems) console.error(problem);
process.exit(problems.length === 0 ? 0 : 1);
