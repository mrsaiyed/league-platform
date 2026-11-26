// The two-league test's standing check (scripts/fence-filter-check.mjs, step 2.224):
// its excused list stays short, reviewed and true, and each of the audit's confirmed gaps
// (thirteen filters) is CAUGHT with its filter taken out. The check works in a temporary
// copy of packages/database, never in the repository's files, so this test is safe beside
// others running at the same time. The whole sweep over every query file is not run here
// (30 to 45 minutes, T-294): it is a GitHub job (step 2.224, part 2).
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { filtersIn, fingerprintsOf, unknownComparisons } from '../scripts/fence-filter-shapes.mjs';
import { verdictOf } from '../scripts/fence-filter-verdict.mjs';

const script = 'scripts/fence-filter-check.mjs';
const run = (...args) => execFileSync(process.execPath, [script, ...args], { encoding: 'utf8' });

/**
 * The reviewed number: raising it is a change to this test, seen in review. 64 since step
 * 2.224, part 2: the purge's 4; 12 filters that only repeat another filter of the same
 * statement (games-for-lists #2 to #5, list-earlier-rounds #1 to #3, list-season-teams #1
 * to #3, remove-table-player #4, which only narrows which entries keep a person #3 already
 * holds to the league; list-public-schedule #1, read only after the league-filtered
 * findPublicSeason);
 * and 48 files with no league filter of their own (no SQL, inserts the fence checks,
 * reads before any league by design, reads only through other checked query files).
 * 95 since part 3: 14 filters of one statement whose tables are joined on league_id, so the
 * others still hold every row (find-table-player #1 to #3, is-person-on-roster #1 and #2,
 * list-decided-game-lines #1 and #2, list-game-roster #1 to #4, list-teams-of-account #1 to
 * #3); 17 keyed by ids another league-filtered statement chose, or whose write a composite
 * foreign key refuses for another league's row (delete-rounds #1 to #3,
 * insert-published-games #4 to #6, insert-roster-entry #1, insert-table-player #1,
 * list-season-names #3, list-table-teams #2, list-venues #2, set-current-season #2 and #3,
 * update-published-game #2, update-season #1 to #3).
 * 96 since step 2.56, last part: insert-standings-coin-flip, an insert the fence checks.
 * 98 since step 2.128: change-own-email.ts and email-free-for-own-account.ts, each only
 * calling an owner-run function about the transaction's own account (approved by the lead,
 * 2026-11-25). 100 since its read-own-name.ts and rename-own-profile.ts, each keyed by the
 * transaction's own account and its 'self' profile (decided by the lead, 2026-11-26).
 */
const reviewedExcused = 100;

/** The audit's confirmed gaps, by name, each with the start of the filter it takes out. */
const gaps = [
  ['list-public-roster.ts#1', ".where('id'"],
  ['list-public-roster.ts#2', ".where('roster_entries.league_id'"],
  ['find-public-team.ts#1', ".where('teams.league_id'"],
  ['list-public-games.ts#1', ".where('games.league_id'"],
  ['find-public-season.ts#1', ".where('seasons.league_id'"],
  ['find-public-game-facts.ts#1', ".where('games.league_id'"],
  ['list-public-teams.ts#1', ".where('teams.league_id'"],
  ['list-postponed-games.ts#1', ".where('league_id'"],
  ['list-binned.ts#1', 't.league_id = ${league}'],
  ['purge-binned.ts#2', 'v.league_id = ${league}'],
  ['restore-binned-game.ts#1', ".where('league_id'"],
  ['has-binned-game-part.ts#1', 'g.league_id = ${scope.leagueId}'],
  ['insert-schedule-draft.ts#1', 's.league_id = ${scope.leagueId}'],
];

/** A group's failure as vitest reports it, its lines marked as the harness marks them. */
const failureListing = (...lines) =>
  [
    `AssertionError: ${lines.length} failures:`,
    ...lines,
    ": expected [ { subject: 'listPublicRoster', …(3) } ] to deeply equal []",
    '    at packages/database/src/isolation/isolation-cases.test.ts:61:73',
  ].join('\n');

test('a failure is caught only when it lists a leak, never for a case that crashed', () => {
  const leak = failureListing(
    'UNCHECKED app the public roster: could not be compared: boom',
    'LEAK code-only the public roster: returned "bravo team" of league bravo',
  );
  assert.deepEqual(verdictOf([leak]), { verdict: 'caught' });

  const crashed = verdictOf([
    failureListing(
      'UNCHECKED app the public roster: could not be checked: current transaction is aborted',
      'UNCHECKED code-only the public roster: could not be compared: column "x" does not exist',
    ),
  ]);
  assert.equal(crashed.verdict, 'error');
  assert.match(crashed.reason, /^no leak listed, only: UNCHECKED app the public roster: could /);
  assert.equal(verdictOf([failureListing()]).verdict, 'error');

  const unloaded = verdictOf([
    'Error: Failed to load url ../queries/list-public-roster.js\n    at loadAndTransform',
  ]);
  assert.deepEqual(unloaded, {
    verdict: 'error',
    reason: 'Error: Failed to load url ../queries/list-public-roster.js',
  });
});

/** A query file's text, its filters given line by line. */
const fixture = (...lines) =>
  ['export async function listThings(scope) {', '  return trx', ...lines, '}', ''].join('\n');
const own = "    .where('league_id', '=', scope.leagueId)";

test('an excuse by position cannot slide: each filter has a print its neighbours do not', () => {
  const two = fixture("    .selectFrom('a')", own, '    .execute();', "    .selectFrom('b')", own);
  const prints = fingerprintsOf(two);
  assert.equal(prints.length, 2);
  assert.notEqual(prints[0], prints[1], 'two filters alike in text are told apart');
  assert.deepEqual(fingerprintsOf(two), prints, 'the same text, the same prints');
  // A filter added above the second: the count changes, and #2 is no longer the same one.
  const three = fixture(
    "    .selectFrom('a')",
    own,
    '    .execute();',
    "    .selectFrom('b')",
    own,
    own,
  );
  const now = fingerprintsOf(three);
  assert.equal(now.length, 3);
  assert.notEqual(now[1], prints[1]);
});

test('a league_id comparison in a shape the check does not know is reported with its line', () => {
  const text = fixture(
    "    .selectFrom('seasons')",
    "    .innerJoin('programs', 'programs.league_id', 'seasons.league_id')",
    "    .onRef('programs.league_id', '=', 'seasons.league_id')",
    "    .values({ league_id: scope.leagueId, name: 'x' })",
    '    // not a filter: where league_id = 1',
    own,
    "    .where((e) => e('seasons.league_id','=',scope.leagueId))",
    '    sql`select 1 from t where t.league_id = s.league_id and t.league_id = any(${ids})`',
  );
  assert.equal(filtersIn(text).length, 1);
  assert.deepEqual(
    unknownComparisons(text).map(({ line }) => line),
    [9, 10],
    'the e(...) filter and the league_id = any(...), not the join, value, comment or known filter',
  );
});

test('the excused list is no longer than reviewed, and each excuse names a filter it finds', () => {
  const excused = run('--excused')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'));
  assert.ok(excused.length <= reviewedExcused, `${excused.length} excused`);
  const listed = run('--list');
  for (const [key, reason] of excused) {
    assert.ok(reason.trim().length > 10, `${key} has a reason`);
    assert.match(listed, new RegExp(`^${key.replace(/[.#]/g, '\\$&')}  `, 'm'));
  }
});

test("it takes out the league filter of each of the audit's confirmed gaps", () => {
  const listed = run('--list');
  for (const [key, filter] of gaps) assert.ok(listed.includes(`${key}  ${filter}`), key);
});

test("each of the audit's confirmed gaps is caught, on its cases' assertion", () => {
  const result = spawnSync(process.execPath, [script, '--jobs=3', ...gaps.map(([key]) => key)], {
    encoding: 'utf8',
    // About 70 s on a quiet machine; GitHub's are slower and busy.
    timeout: 12 * 60 * 1000,
  });
  const out = `${result.stdout}${result.stderr}`;
  for (const [key] of gaps) {
    assert.match(out, new RegExp(`^${key.replace(/[.#]/g, '\\$&')}  caught  `, 'm'), out);
  }
  assert.equal(result.status, 0, out);
});
