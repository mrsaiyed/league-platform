// What `npm run league:make` says (scripts/make-league.messages.mjs) where saying too
// much would be untrue or would answer its own question. Made-up values only.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  checkBeforeAnswering,
  confirmHosted,
  made,
  makeProblemLines,
} from '../scripts/make-league.messages.mjs';

const plan = {
  name: 'Made-up Hoops',
  slug: 'made-up-hoops',
  staffEmail: 'staff@example.test',
  ownerEmail: 'owner@example.test',
  season: { name: 'Fall 2026' },
};

test('when it is not known whether the league was made, it never says an account is unused', () => {
  const lines = makeProblemLines(
    { kind: 'failed', league: 'unknown', reason: 'ECONNRESET' },
    {
      removed: [],
      left: [
        { email: 'staff@example.test', accountId: 'made-up-1' },
        { email: 'owner@example.test', accountId: null },
      ],
    },
  ).join('\n');
  assert.match(lines, /whether the league was made is not known/);
  assert.match(
    lines,
    /The accounts this run made are still there: staff@example\.test, owner@example\.test/,
  );
  assert.match(lines, /Whether a league uses them is not known/);
  assert.match(lines, /Do not remove anything/);
  assert.match(lines, /Run this again with the same answers: it will say what exists/);
  for (const untrue of [
    'no league uses it',
    'does no harm',
    'delete that one row',
    'not made',
    'No league',
  ]) {
    assert.ok(!lines.includes(untrue), untrue);
  }
});

test('an account that may have been made but could not be looked up is not called removable', () => {
  const lines = makeProblemLines(
    { kind: 'failed', league: 'not-made' },
    { removed: [], left: [{ email: 'owner@example.test', accountId: null }] },
  ).join('\n');
  assert.match(lines, /may have been made for owner@example\.test/);
  assert.ok(!lines.includes('delete that one row'));
});

test('the hosted question does not print its own answer, and the project is shown to check', () => {
  assert.ok(!confirmHosted.includes(plan.slug));
  assert.ok(!confirmHosted.includes('('));
  const shown = checkBeforeAnswering({
    kind: 'postgres',
    host: 'aws-0-us-east-1.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
    project: 'madeupprojectref0001',
    onThisComputer: false,
  });
  assert.equal(shown[0], 'Supabase project: madeupprojectref0001');
  assert.match(shown[1], /Supabase dashboard/);
});

test('after making it, it prints what the database holds, read back, and that nothing was sent', () => {
  const readBack = {
    league: { slug: 'made-up-hoops', status: 'draft' },
    seasons: [{ name: 'Fall 2026', status: 'draft', isCurrent: true }],
    log: [
      { action: 'leagues.create', actorEmail: 'staff@example.test' },
      { action: 'leagues.create_season', actorEmail: 'staff@example.test' },
    ],
    owner: { email: 'owner@example.test', signedUp: false },
    staffGrants: 0,
  };
  const lines = made(
    { owner: 'none', leagueId: 'made-up-id', readBack },
    plan,
    '/made-up-hoops',
  ).join('\n');
  assert.match(lines, /League {10}made-up-hoops, draft \(as it should be\)/);
  assert.match(lines, /Season {10}Fall 2026, draft, the current one \(as it should be\)/);
  assert.match(
    lines,
    /leagues\.create by staff@example\.test; leagues\.create_season by staff@example\.test \(as it should be\)/,
  );
  assert.match(lines, /owner@example\.test, no sign-in link yet \(as it should be\)/);
  assert.match(lines, /0 role grants in the league \(as it should be\)/);
  assert.match(lines, /Nothing was sent to anyone/);
  const wrong = made(
    { owner: 'none', leagueId: 'made-up-id', readBack: { ...readBack, staffGrants: 1 } },
    plan,
    '/made-up-hoops',
  ).join('\n');
  assert.match(wrong, /1 role grants in the league \(NOT as it should be/);
});

// U-16: a short name on the starter list of offensive words, or holding one as a word, is
// refused in plain words by the script itself, before any database is opened or made; it
// says which it was: one of our own words, or an offensive one.
test('a short name with a word from the offensive starter list is refused in plain words', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const folder = mkdtempSync(path.join(os.tmpdir(), 'make-league-words-'));
  // No database address of this shell's reaches the script: it is told a folder only.
  const withoutDatabases = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !/DATABASE|^PG/i.test(name)),
  );
  try {
    const offensive =
      'Short name: that word is not allowed (it is on our list of offensive words). Choose another.';
    const ours =
      'Short name: that word is one of ours (the site uses it for its own pages). Choose another.';
    for (const [shortName, said] of [
      ['shit-hoops', offensive],
      ['Fuck', offensive],
      ['ragheads', offensive],
      ['admin', ours],
    ]) {
      const run = spawnSync(
        process.execPath,
        [
          '--disable-warning=ExperimentalWarning',
          path.join(root, 'scripts/make-league.mjs'),
          ...['--name', 'Made-up Hoops', '--short-name', shortName, '--sport', 'basketball'],
          ...['--who-plays', 'adults', '--city', 'Springfield', '--time-zone', 'America/Chicago'],
          ...['--contact-email', 'contact@example.test', '--owner-email', 'owner@example.test'],
          ...['--as', 'staff@example.test', '--db', path.join(folder, 'db')],
        ],
        { cwd: root, encoding: 'utf8', input: '', env: withoutDatabases },
      );
      assert.equal(run.status, 2, `${shortName}: ${run.stderr}`);
      assert.equal(run.stderr.trim(), said, shortName);
      assert.ok(!existsSync(path.join(folder, 'db')), 'no database was made');
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
