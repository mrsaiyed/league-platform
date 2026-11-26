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
//   node scripts/fence-filter-check.mjs --prints [files]    each excused file's count and
//                                                            prints, to paste after a review
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
import { filtersIn, fingerprintsOf, unknownComparisons } from './fence-filter-shapes.mjs';
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
  // Step 2.224, part 3: one statement whose tables are joined on league_id (`on x.league_id
  // = y.league_id`): with any one table's filter taken out, another table's filter and the
  // join's equality still hold every row to the scope's league.
  ...joinedOnLeague('find-table-player.ts', 3),
  ...joinedOnLeague('is-person-on-roster.ts', 2),
  ...joinedOnLeague('list-decided-game-lines.ts', 2),
  ...joinedOnLeague('list-game-roster.ts', 4),
  ...joinedOnLeague('list-teams-of-account.ts', 3),
  // Step 2.224, part 3: a statement keyed by ids that another league-filtered statement of
  // the same query chose, or one whose write a composite foreign key refuses for another
  // league's row (courts_venue, games_court, games_home_team, games_away_team, games_round,
  // roster_entries_team, seasons_program: each names the league with the key).
  ['delete-rounds.ts#1', "#2 and #3, the writes it feeds, each name the scope's league again"],
  ['delete-rounds.ts#2', "keyed by the round ids #1 chose; games_round ties a game's round"],
  ['delete-rounds.ts#3', "keyed by the round ids #1's league-filtered read chose"],
  ['insert-published-games.ts#4', 'the home team read for its division; games_home_team refuses'],
  ['insert-published-games.ts#5', 'the away team read for its division; games_away_team refuses'],
  ['insert-published-games.ts#6', "a court found at the game's venue; games_court refuses"],
  ['insert-roster-entry.ts#1', "the sort over the entry's own team; roster_entries_team refuses"],
  ['insert-table-player.ts#1', "the sort over the entry's own team; roster_entries_team refuses"],
  ['list-season-names.ts#3', "courts are kept only for the venues #2's league-filtered read found"],
  ['list-table-teams.ts#2', "a game of #1's teams and season; games_home_team, games_away_team"],
  ['list-venues.ts#2', "courts are kept only for the venues #1's league-filtered read found"],
  ['set-current-season.ts#2', 'the program of the season #1 found; seasons_program the rest'],
  ['set-current-season.ts#3', "keyed by the season id #1's league-filtered read found"],
  ['update-published-game.ts#2', "a court found at the slot's venue; games_court refuses"],
  ['update-season.ts#1', "#3, the write, names the scope's league again (and #2)"],
  ['update-season.ts#2', 'the program of the season #1 found; seasons_program the rest'],
  ['update-season.ts#3', "keyed by the season id #1's league-filtered read found"],
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
    'insert-standings-coin-flip.ts',
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
// 4 of the purge, 12 repeated filters and 48 files with no filter of their own (2.224,
// part 2); 14 filters of statements joined on league_id and 17 statements keyed by another
// league-filtered statement or held by a composite key (part 3); the coin flip's insert (2.56).
const mostExcused = 96;

/** Whole-file excuses: each file name with the one reason. */
function wholeFiles(reason, ...files) {
  return files.map((file) => [file, reason]);
}

/** Every filter #1 to #count of one statement whose tables are joined on league_id. */
function joinedOnLeague(file, count) {
  return Array.from({ length: count }, (_, i) => [
    `${file}#${i + 1}`,
    "its tables are joined on league_id, so the statement's other league filters hold it",
  ]);
}

/**
 * Each file with excuses by position, as it was when they were reviewed: its number of
 * filters, and each excused filter's print (its text and the lines around it,
 * fence-filter-shapes.mjs). A filter added, removed or moved in the file changes one or the
 * other, and the check then fails until a person reads the file's excuses again and pastes
 * the new line that `--prints <file>` writes. So an excuse never slides onto another filter.
 */
const reviewedFiles = new Map(
  [
    ['delete-rounds.ts', 3, '#1:e138b693 #2:0327236f #3:af2d161c'],
    ['find-table-player.ts', 3, '#1:25235fe9 #2:9f5402e5 #3:c6fdbf4f'],
    ['games-for-lists.ts', 5, '#2:737306aa #3:53141c2d #4:25c7777a #5:4ea42f7d'],
    ['insert-published-games.ts', 7, '#4:c7893d9a #5:57bc3665 #6:06f4d20d'],
    ['insert-roster-entry.ts', 1, '#1:95defd5a'],
    ['insert-table-player.ts', 1, '#1:1e47bf4f'],
    ['is-person-on-roster.ts', 2, '#1:bd91ec9f #2:075519b6'],
    ['list-decided-game-lines.ts', 2, '#1:089ba6a0 #2:7a0a9c01'],
    ['list-earlier-rounds.ts', 3, '#1:c16e2061 #2:101d4ef4 #3:0140c76a'],
    ['list-game-roster.ts', 4, '#1:6751b205 #2:a9a687c9 #3:f6bbf1b1 #4:eb1ec702'],
    ['list-public-schedule.ts', 1, '#1:4ccdd30a'],
    ['list-season-names.ts', 3, '#3:01b68703'],
    ['list-season-teams.ts', 3, '#1:fd8ed90c #2:2983ac7d #3:5ce51dbb'],
    ['list-table-teams.ts', 2, '#2:2983ac7d'],
    ['list-teams-of-account.ts', 3, '#1:5f91450f #2:70d90293 #3:5b693c32'],
    ['list-venues.ts', 2, '#2:d7b516be'],
    ['purge-binned.ts', 8, '#3:06901377 #4:0c9fbde6 #5:81e26238 #6:fe28f835'],
    ['remove-table-player.ts', 4, '#4:6f98646a'],
    ['set-current-season.ts', 3, '#2:0bed84f4 #3:665c9135'],
    ['update-published-game.ts', 3, '#2:93321121'],
    ['update-season.ts', 3, '#1:bcca7281 #2:0bed84f4 #3:a6718501'],
  ].map(([file, filters, prints]) => [file, { filters, prints }]),
);

/**
 * A `league_id` comparison in a shape the check does not know (not a join equality, not a
 * written value) is a problem unless its line is excused here: `<file>.ts: <the line's
 * text>` with the reason the check need not take it out. Empty: today every comparison is
 * of a known shape.
 */
const unknownExcused = new Map([]);

/** The file's excused positions (n of `file.ts#n`). */
const excusedPositions = (name) =>
  [...excused.keys()]
    .filter((key) => key.startsWith(`${name}#`))
    .map((key) => Number(key.slice(name.length + 1)));

/** The line `--prints` writes for a file, to paste into reviewedFiles once its excuses are read. */
function printsLine(name, text) {
  const filters = filtersIn(text);
  const prints = fingerprintsOf(text, filters);
  const at = excusedPositions(name).sort((x, y) => x - y);
  return `    ['${name}', ${filters.length}, '${at.map((n) => `#${n}:${prints[n - 1] ?? 'none'}`).join(' ')}'],`;
}

/**
 * Why the file's excuses by position may no longer name the filters they were written for:
 * its number of filters, or an excused filter's print, differs from the reviewed one.
 */
function slidExcuses(name, text, filters) {
  const at = excusedPositions(name);
  const reviewed = reviewedFiles.get(name);
  if (at.length === 0 && reviewed === undefined) return [];
  const again = `review this file's excuses again (node scripts/fence-filter-check.mjs --prints ${name.replace(/\.ts$/, '')})`;
  if (reviewed === undefined)
    return [`${name}: excused by position with no reviewed prints: ${again}`];
  const found = [];
  if (reviewed.filters !== filters.length) {
    found.push(
      `${name}: had ${reviewed.filters} filters when its excuses were reviewed, has ${filters.length} now: ${again}`,
    );
  }
  const prints = fingerprintsOf(text, filters);
  const kept = new Map(
    reviewed.prints
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => /^#(\d+):(\w+)$/.exec(p) ?? [p, p, ''])
      .map(([, n, print]) => [Number(n), print]),
  );
  for (const n of at) {
    if (kept.get(n) !== prints[n - 1]) {
      found.push(`${name}#${n}: not the filter it was excused for (its print differs): ${again}`);
    }
  }
  for (const n of kept.keys()) {
    if (!at.includes(n)) found.push(`${name}#${n}: a reviewed print with no excuse: ${again}`);
  }
  return found;
}

/** Each comparison in an unknown shape whose line is not excused, as a problem. */
function unknownShapes(name, text, filters) {
  return unknownComparisons(text, filters)
    .filter(({ text: line }) => !unknownExcused.has(`${name}: ${line}`))
    .map(
      ({ line, text: code }) =>
        `${name}:${line}: a league_id comparison in a shape the check does not know: ${code}` +
        ' (teach the check its shape, or excuse the line with a reason)',
    );
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
if (args.includes('--prints')) {
  // For a person who has read a file's excuses again: the line to paste into reviewedFiles
  // (every file with excuses by position, or only the files named).
  for (const { file } of asked) {
    const name = file.split('/').pop();
    if (args.length > 1 || excusedPositions(name).length > 0) {
      console.log(printsLine(name, readFileSync(join(root, file), 'utf8')));
    }
  }
  process.exit(0);
}

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
  problems.push(...slidExcuses(name, original, filters), ...unknownShapes(name, original, filters));
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
