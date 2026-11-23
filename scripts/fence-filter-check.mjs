#!/usr/bin/env node
// The two-league test's standing check (step 2.224, data audit finding D-M1, T-65).
//
// The two-league test (packages/database/src/isolation) is meant to prove that every
// query names its league. This proves the test can: it takes each league filter out of
// a query, one filter at a time, runs that query's own cases (the groups named for the
// functions the file exports), and expects them to FAIL. A filter whose removal the
// cases do not notice is a gap in the test: the check fails and names it.
//
// The query is changed on disk only while its cases run and is put back byte for byte
// afterwards, whatever happens (the check then reads it back and refuses if it differs).
//
//   node scripts/fence-filter-check.mjs                 every query file and both read stores
//   node scripts/fence-filter-check.mjs purge-binned …  only these files (names without .ts)
//   node scripts/fence-filter-check.mjs --list          the filters it would take out, no runs
//   node scripts/fence-filter-check.mjs --excused       the reviewed excused list
//
// It runs one test process per filter (about ten seconds each), so the whole sweep takes
// a long time: see the step's pending decision for where it runs.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const casesTest = 'packages/database/src/isolation/isolation-cases.test.ts';
const vitest = join(root, 'node_modules', '.bin', 'vitest');

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
]);
const mostExcused = 4;

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

function filesToCheck(names) {
  const queries = readdirSync(join(root, 'packages/database/src/queries'))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'index.ts')
    .map((f) => `packages/database/src/queries/${f}`);
  const stores = ['games-read-store.ts', 'standings-read-store.ts'].map(
    (f) => `packages/database/src/stores/${f}`,
  );
  const all = [...queries, ...stores];
  if (names.length === 0) return all;
  return names.map((name) => {
    const file = all.find((f) => f.endsWith(`/${name}.ts`));
    if (file === undefined) throw new Error(`no query or read store named ${name}`);
    return file;
  });
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

/** Runs the groups of these subjects; true when every one passed. */
function casesPass(subjects) {
  const pattern = `no case of '(${subjects.map(escaped).join('|')})' reaches`;
  const result = spawnSync(vitest, ['run', casesTest, '-t', pattern], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CI: '1' },
  });
  const out = `${result.stdout}${result.stderr}`;
  const ran = /Tests\s+.*?(\d+) passed/.exec(out.replace(/\x1b\[[0-9;]*m/g, ''));
  return { passed: result.status === 0, ran: ran === null ? 0 : Number(ran[1]) };
}

const args = process.argv.slice(2);
const listOnly = args.includes('--list');
if (args.includes('--excused')) {
  // For tests/fence-filter-check.test.mjs: the reviewed list, one `key<TAB>reason` a line.
  for (const [key, reason] of excused) console.log(`${key}\t${reason}`);
  process.exit(0);
}
const files = filesToCheck(args.filter((a) => !a.startsWith('--')));

if (excused.size > mostExcused) {
  console.error(
    `The excused list has ${excused.size} entries, more than the reviewed ${mostExcused}.`,
  );
  process.exit(1);
}

const problems = [];
let checked = 0;
for (const file of files) {
  const path = join(root, file);
  const original = readFileSync(path, 'utf8');
  const filters = filtersIn(original);
  const subjects = subjectsOf(original);
  const name = file.split('/').pop();
  if (filters.length === 0) {
    console.log(`${name}: no league filter of a known shape (not checked)`);
    continue;
  }
  // The cases must pass as written first, or a failure with a filter gone proves nothing.
  if (!listOnly) {
    const asWritten = casesPass(subjects);
    if (!asWritten.passed || asWritten.ran === 0) {
      console.log(`${name}: its cases do not pass as written (not checked)`);
      problems.push(`${name}: the cases of ${subjects.join(', ')} do not pass as written`);
      continue;
    }
  }
  for (const [i, filter] of filters.entries()) {
    const key = `${name}#${i + 1}`;
    if (listOnly) {
      console.log(`${key}  ${filter.text}`);
      continue;
    }
    const changed =
      original.slice(0, filter.at) + filter.gone + original.slice(filter.at + filter.length);
    let verdict;
    const started = Date.now();
    try {
      writeFileSync(path, changed);
      verdict = casesPass(subjects);
    } finally {
      writeFileSync(path, original);
    }
    if (readFileSync(path, 'utf8') !== original) {
      throw new Error(`${file} was not put back as it was: restore it from git now`);
    }
    checked += 1;
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const caught = !verdict.passed;
    const excuse = excused.get(key);
    const none = !caught && verdict.ran === 0;
    const label = caught
      ? 'caught'
      : excuse !== undefined
        ? 'excused'
        : none
          ? 'NO CASES'
          : 'SURVIVED';
    console.log(`${key}  ${label}  (${seconds}s)  ${filter.text}`);
    if (!caught && excuse === undefined) {
      problems.push(
        none
          ? `${key}: no case of ${subjects.join(', ')} ran`
          : `${key}: its cases still pass with "${filter.text}" taken out`,
      );
    }
    if (caught && excuse !== undefined)
      problems.push(`${key}: excused, but caught: drop the excuse`);
  }
}

if (listOnly) process.exit(0);
console.log(`\n${checked} filters taken out, ${problems.length} problems.`);
for (const problem of problems) console.error(problem);
process.exit(problems.length === 0 ? 0 : 1);
