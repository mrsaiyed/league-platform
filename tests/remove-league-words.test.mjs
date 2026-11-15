// What `npm run league:remove` says (scripts/remove-league.messages.mjs, step 2.150):
// what was NOT removed and why, never more than is known, and a question that does
// not print its own answer. Made-up values only.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  agoWords,
  confirm,
  confirmOwner,
  inUseLines,
  planLines,
  readinessLines,
  removedLines,
  removeProblemLines,
  targetProblemLines,
} from '../scripts/remove-league.messages.mjs';

const madeAtMs = Date.UTC(2026, 10, 15, 14, 3);
const league = {
  leagueId: 'made-up-league-id',
  slug: 'made-up-hoops',
  name: 'Made-up Hoops',
  status: 'draft',
  city: 'Springfield',
  madeAt: '2026-11-15 14:03 UTC',
  madeAtMs,
  version: 1,
  createdAt: '2026-11-15 14:03:00.123456+00',
  seasons: ['Fall 2026'],
  ownerAccountId: 'made-up-owner-id',
  ownerEmail: 'owner@example.test',
  madeByEmail: 'staff@example.test',
  problems: [],
};
const place = { kind: 'folder', folder: '/made-up/seed-db' };

test('the question does not print the short name it asks for', () => {
  assert.ok(!confirm.includes('made-up-hoops'));
  assert.match(confirm, /type the league’s short name/);
});

test('the plan says what goes, what stays, and why the owner’s account is kept', () => {
  const now = madeAtMs + 40 * 60_000;
  const removing = planLines({ league, ownerKept: [] }, place, now).join('\n');
  assert.match(removing, /This will remove, in one step:/);
  assert.match(
    removing,
    /Made {12}2026-11-15 14:03 UTC \(40 minutes ago\), by staff@example\.test/,
  );
  assert.match(removing, /owner@example\.test: removed too \(nobody has ever signed in with it/);
  assert.match(removing, /one line in the platform’s own log: who removed it, and when/);
  assert.match(removing, /Where {11}a folder: \/made-up\/seed-db/);
  assert.ok(!removing.includes('already signed in'));
  const keeping = planLines({ league, ownerKept: ['signed-in', 'owns-league'] }, place, now).join(
    '\n',
  );
  assert.match(
    keeping,
    /owner@example\.test: kept, because it has signed in before; it owns another league/,
  );
  // On a line of its own when the owner has signed in (area 5 review, M3).
  assert.ok(
    planLines({ league, ownerKept: ['signed-in'] }, place, now).includes(
      'Its owner has already signed in. They will find their league gone.',
    ),
  );
  assert.match(confirmOwner, /also type the owner’s email address/);
  assert.ok(!confirmOwner.includes('owner@example.test'));
});

test('says how long ago in plain words', () => {
  assert.equal(agoWords(20_000), 'just now');
  assert.equal(agoWords(60_000), '1 minute ago');
  assert.equal(agoWords(3 * 3_600_000), '3 hours ago');
  assert.equal(agoWords(3 * 86_400_000), '3 days ago');
});

test('refuses an old plan, and an owner’s email typed wrong, in plain words', () => {
  const request = { slug: 'made-up-hoops', staffEmail: 'staff@example.test' };
  assert.match(
    removeProblemLines({ kind: 'changed-since-plan' }, request)[0],
    /not the one this plan showed: it was removed, made again or changed since\. Nothing was removed\./,
  );
  assert.match(
    removeProblemLines({ kind: 'owner-email-differs' }, request)[0],
    /not the owner’s email address, exactly\. Nothing was removed\./,
  );
});

test('a used league is refused with what was found, and step 2.133 named', () => {
  const lines = inUseLines(league, [
    { kind: 'state', state: 'live' },
    { kind: 'rows', table: 'public.games', count: 1 },
    { kind: 'rows', table: 'public.role_grants', count: 2 },
    { kind: 'rows', table: 'public.made_up_later', count: 3 },
    { kind: 'activity' },
  ]).join('\n');
  assert.match(lines, /- it is published/);
  assert.match(lines, /- it has games: 1/);
  assert.match(lines, /- it has roles given to someone \(ended ones count too\): 2/);
  assert.match(lines, /- it has 3 rows in public\.made_up_later/);
  assert.match(lines, /not this tool’s to remove: that is step 2\.133/);
  assert.match(lines, /Nothing was removed\.$/);
});

test('says the owner’s account was kept, and why, after removing the league', () => {
  const removed = {
    leagueId: 'made-up-league-id',
    slug: 'made-up-hoops',
    name: 'Made-up Hoops',
    logEntryId: 'made-up-entry',
    ownerEmail: 'owner@example.test',
    owner: { removed: false, kept: ['signed-in'] },
    readBack: {
      entry: {
        action: 'leagues.remove_draft',
        leagueId: 'made-up-league-id',
        slug: 'made-up-hoops',
        name: 'Made-up Hoops',
        actorEmail: 'staff@example.test',
      },
      rowsLeft: 0,
      shortNameFree: true,
      ownerAccountThere: true,
    },
  };
  const lines = removedLines(removed, 'staff@example.test').join('\n');
  assert.match(
    lines,
    /The owner’s account \(owner@example\.test\) was kept: it has signed in before\./,
  );
  assert.match(
    lines,
    /Its owner had already signed in: tell them yourself, at owner@example\.test, that the league was removed\./,
  );
  assert.match(lines, /League {10}gone: nothing of it is left in any table \(as it should be\)/);
  assert.match(
    lines,
    /Platform log {4}leagues\.remove_draft of made-up-hoops by staff@example\.test \(as it should be\)/,
  );
  assert.match(lines, /Owner’s account still there \(as it should be\)/);
  const wrong = removedLines(
    { ...removed, readBack: { ...removed.readBack, rowsLeft: 2 } },
    'staff@example.test',
  ).join('\n');
  assert.match(wrong, /2 of its rows still there \(NOT as it should be/);
});

test('never says more than is known when something went wrong', () => {
  const request = { slug: 'made-up-hoops', staffEmail: 'staff@example.test' };
  const unknown = removeProblemLines({ kind: 'failed', league: 'unknown' }, request).join('\n');
  assert.match(unknown, /whether the league was removed is not known/);
  assert.ok(!unknown.includes('still there, whole'));
  const kept = removeProblemLines(
    { kind: 'failed', league: 'not-removed', reason: 'ECONNRESET' },
    request,
  ).join('\n');
  assert.match(kept, /\(ECONNRESET\)\. The league is still there, whole\. Nothing was removed\./);
  assert.match(removeProblemLines({ kind: 'not-found' }, request)[0], /removed already/);
});

test('the twin’s refusals say "removed" where they said "made"', () => {
  const lines = [
    ...targetProblemLines({ kind: 'tracker-database', login: 'migration' }),
    ...targetProblemLines({ kind: 'not-the-same-database' }),
    ...readinessLines({ kind: 'migrations', state: 'behind' }),
    ...readinessLines({
      kind: 'login',
      problems: [{ login: 'migration', gaps: ['removal'] }],
    }),
  ].join('\n');
  assert.ok(!/made\./.test(lines), lines);
  assert.match(lines, /Nothing was read and nothing was removed\./);
  assert.match(lines, /may not run the removal/);
});
