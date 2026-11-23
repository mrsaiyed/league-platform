// The two-league test's standing check (scripts/fence-filter-check.mjs, step 2.224):
// it finds the filters of the audit's twelve gaps, and its excused list stays short,
// reviewed and true. Running the sweep itself takes long; see record 096.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

const run = (...args) =>
  execFileSync(process.execPath, ['scripts/fence-filter-check.mjs', ...args], {
    encoding: 'utf8',
  });

/** The reviewed number: raising it is a change to this test, seen in review. */
const reviewedExcused = 4;

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

test("it takes out the league filter of each of the audit's twelve gaps", () => {
  const gaps = [
    "list-public-roster.ts#2  .where('roster_entries.league_id'",
    "find-public-team.ts#1  .where('teams.league_id'",
    "list-public-games.ts#1  .where('games.league_id'",
    "find-public-season.ts#1  .where('seasons.league_id'",
    "find-public-game-facts.ts#1  .where('games.league_id'",
    "list-public-teams.ts#1  .where('teams.league_id'",
    "list-postponed-games.ts#1  .where('league_id'",
    'list-binned.ts#1  t.league_id = ${league}',
    'purge-binned.ts#2  v.league_id = ${league}',
    "restore-binned-game.ts#1  .where('league_id'",
    'has-binned-game-part.ts#1  g.league_id = ${scope.leagueId}',
    'insert-schedule-draft.ts#1  s.league_id = ${scope.leagueId}',
  ];
  const listed = run('--list');
  for (const gap of gaps) assert.ok(listed.includes(gap), gap);
});
