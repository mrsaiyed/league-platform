// The two-league test's standing check (scripts/fence-filter-check.mjs, step 2.224):
// its excused list stays short, reviewed and true, and each of the audit's confirmed gaps
// (thirteen filters) is CAUGHT with its filter taken out. The check works in a temporary
// copy of packages/database, never in the repository's files, so this test is safe beside
// others running at the same time. The whole sweep over every query file is not run here
// (30 to 45 minutes, T-294): it is a GitHub job (step 2.224, part 2).
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { test } from 'node:test';

const script = 'scripts/fence-filter-check.mjs';
const run = (...args) => execFileSync(process.execPath, [script, ...args], { encoding: 'utf8' });

/** The reviewed number: raising it is a change to this test, seen in review. */
const reviewedExcused = 4;

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
    timeout: 8 * 60 * 1000,
  });
  const out = `${result.stdout}${result.stderr}`;
  for (const [key] of gaps) {
    assert.match(out, new RegExp(`^${key.replace(/[.#]/g, '\\$&')}  caught  `, 'm'), out);
  }
  assert.equal(result.status, 0, out);
});
