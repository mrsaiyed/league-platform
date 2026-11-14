// Step 2.125 part 1's done test, on PGlite only (T-201): the tool makes a draft league,
// with its first season as the current one, for an owner whose email has no account
// yet; when that person first signs in, the account is theirs and owns the league.
import type { PGlite } from '@electric-sql/pglite';
import { getSeason, planNewLeague, setLeagueName, type NewLeaguePlan } from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { accountForSignIn } from '../queries/index.ts';
import { freshSchema, newAccount, one, unique } from '../schema/schema.test-helper.ts';
import { accessStore } from '../stores/access-store.ts';
import { activityLogStore } from '../stores/activity-log-store.ts';
import { divisionsStore } from '../stores/divisions-store.ts';
import { jobsStore } from '../stores/jobs-store.ts';
import { leaguesStore } from '../stores/leagues-store.ts';
import { openLeagueMakingTarget, type LeagueMakingTarget } from './league-making-target.ts';
import { makeLeague, previewNewLeague } from './make-league.ts';

let pglite: PGlite;
let target: LeagueMakingTarget;
beforeAll(async () => {
  pglite = await freshSchema();
  const opened = await openLeagueMakingTarget({ kind: 'pglite', pglite });
  if (!opened.ok) throw new Error(opened.problem);
  target = opened.target;
});
afterAll(async () => {
  await target.close();
  await pglite.close();
});

const staffEmail = 'staff@example.test';

function planFor(change: Record<string, string> = {}): NewLeaguePlan {
  const result = planNewLeague({
    name: 'Made-up Hoops',
    shortName: unique('hoops'),
    sport: 'basketball',
    whoPlays: 'adults',
    city: 'Springfield',
    timeZone: 'America/Chicago',
    contactEmail: 'hello@example.test',
    ownerEmail: `${unique('owner')}@example.test`,
    seasonName: 'Fall 2026',
    ...change,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  return result.plan;
}

const countOf = async (text: string, params: unknown[] = []) =>
  (await one<{ n: number }>(pglite, text, params)).n;

describe('makeLeague', () => {
  it('makes a draft league with its first season as current, for an email with no account', async () => {
    const plan = planFor({ ownerEmail: 'new.owner@example.test' });
    expect(await previewNewLeague(target, plan, staffEmail)).toEqual({
      schemaReady: true,
      shortNameHeld: false,
      ownerHasAccount: false,
      staffHasAccount: false,
    });

    const outcome = await makeLeague(target, plan, { staffEmail });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const { leagueId, seasonId, ownerAccountId } = outcome.made;
    expect(outcome.made.ownerAccountMade).toBe(true);

    expect(
      await one(
        pglite,
        `select slug, name, status, time_zone, audience, contact_email, city, listed,
                owner_account_id from leagues where id = $1`,
        [leagueId],
      ),
    ).toEqual({
      slug: plan.slug,
      name: 'Made-up Hoops',
      status: 'draft',
      time_zone: 'America/Chicago',
      audience: 'adult',
      contact_email: 'hello@example.test',
      city: 'Springfield',
      listed: true,
      owner_account_id: ownerAccountId,
    });
    expect(
      await one(
        pglite,
        `select s.name, s.slug, s.status, s.is_current, p.is_default, p.sport_key
         from seasons s join programs p on p.id = s.program_id where s.id = $1`,
        [seasonId],
      ),
    ).toEqual({
      name: 'Fall 2026',
      slug: 'fall-2026',
      status: 'draft',
      is_current: true,
      is_default: true,
      sport_key: 'basketball',
    });
    // The owner's account waits, with no name and no sign-in, for its first sign-in.
    expect(
      await one(pglite, 'select email, display_name, sign_in_id from accounts where id = $1', [
        ownerAccountId,
      ]),
    ).toEqual({ email: 'new.owner@example.test', display_name: null, sign_in_id: null });
    // Each step is in the league's activity log, under who took it.
    const { rows } = await pglite.query<{ action: string; is_owner: boolean }>(
      `select a.action, a.actor_account_id = l.owner_account_id as is_owner
       from activity_log a join leagues l on l.id = a.league_id
       where a.league_id = $1 order by a.at, a.id`,
      [leagueId],
    );
    expect(rows).toEqual([
      { action: 'leagues.create', is_owner: false },
      { action: 'leagues.create_season', is_owner: true },
      { action: 'leagues.set_current_season', is_owner: true },
    ]);

    // The person signs up with that email (any capitals): the account is theirs, and
    // they hold the owner's role in the league.
    const signedIn = await withTransaction(target.db, {}, (scope) =>
      accountForSignIn(scope, 'made-up-sign-in-user-1', 'New.Owner@Example.test'),
    );
    expect(signedIn).toBe(ownerAccountId);
    const deps = {
      transaction: commandTransaction(target.db, (scope) => ({
        jobs: jobsStore(scope),
        leagues: leaguesStore(scope),
        divisions: divisionsStore(scope),
        access: accessStore(scope),
        activity: activityLogStore(scope),
      })),
      events: [],
      log: () => {},
      now: () => Date.now(),
    };
    const asOwner = { leagueId, accountId: signedIn, requestId: 'r-1' };
    expect(await getSeason(asOwner, { seasonId }, deps)).toMatchObject({ ok: true });
    expect(await setLeagueName(asOwner, { name: 'Made-up Hoops Two', version: 1 }, deps)).toEqual({
      ok: true,
      value: { name: 'Made-up Hoops Two', version: 2 },
    });
    // Our staff hold nothing in the league once the run is over (T-77).
    const staffId = (
      await one<{ id: string }>(pglite, 'select id from accounts where email = $1', [staffEmail])
    ).id;
    expect(await getSeason({ ...asOwner, accountId: staffId }, { seasonId }, deps)).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
  });

  it('uses the accounts already there, whatever the capitals of their emails', async () => {
    const ownerId = await newAccount(pglite, 'Has.Account@example.test');
    const plan = planFor({ ownerEmail: 'has.account@EXAMPLE.test' });
    expect(await previewNewLeague(target, plan, 'STAFF@example.test')).toMatchObject({
      ownerHasAccount: true,
      staffHasAccount: true,
    });
    const before = await countOf('select count(*)::int as n from accounts');
    const outcome = await makeLeague(target, plan, { staffEmail: 'STAFF@example.test' });
    expect(outcome).toMatchObject({
      ok: true,
      made: { ownerAccountId: ownerId, ownerAccountMade: false },
    });
    expect(await countOf('select count(*)::int as n from accounts')).toBe(before);
  });

  it('lets our staff member be the owner too', async () => {
    const plan = planFor({ ownerEmail: staffEmail, whoPlays: 'under-18s' });
    const outcome = await makeLeague(target, plan, { staffEmail });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(
      await one(pglite, 'select audience, listed from leagues where id = $1', [
        outcome.made.leagueId,
      ]),
    ).toEqual({ audience: 'youth', listed: false });
  });

  it('makes nothing, not even an account, when the short name is held', async () => {
    const first = planFor();
    expect((await makeLeague(target, first, { staffEmail })).ok).toBe(true);
    const again = planFor({ shortName: first.slug, ownerEmail: 'nobody.yet@example.test' });
    expect(await previewNewLeague(target, again, staffEmail)).toMatchObject({
      shortNameHeld: true,
    });
    const accounts = await countOf('select count(*)::int as n from accounts');
    const leagues = await countOf('select count(*)::int as n from leagues');
    expect(await makeLeague(target, again, { staffEmail })).toEqual({
      ok: false,
      problem: { kind: 'short-name-held' },
    });
    expect(await countOf('select count(*)::int as n from accounts')).toBe(accounts);
    expect(await countOf('select count(*)::int as n from leagues')).toBe(leagues);
  });

  it('says which step refused, and the league already made', async () => {
    // A season short name longer than seasons.slug allows is refused by createSeason.
    const plan = { ...planFor(), season: { name: 'Fall 2026', slug: 'x'.repeat(61) } };
    const outcome = await makeLeague(target, plan, { staffEmail });
    expect(outcome).toMatchObject({
      ok: false,
      problem: { kind: 'refused', step: 'season', code: 'invalid-input' },
    });
    if (outcome.ok || outcome.problem.kind !== 'refused') return;
    expect(
      await one(pglite, 'select status from leagues where id = $1', [outcome.problem.leagueId]),
    ).toEqual({ status: 'draft' });
  });
});

describe('makeLeague on a database without migration 0014', () => {
  it('makes nothing and says the migrations are missing', async () => {
    const old = await freshSchema();
    await old.exec('alter table leagues drop column city');
    const opened = await openLeagueMakingTarget({ kind: 'pglite', pglite: old });
    if (!opened.ok) throw new Error(opened.problem);
    try {
      const plan = planFor();
      expect(await previewNewLeague(opened.target, plan, staffEmail)).toMatchObject({
        schemaReady: false,
      });
      expect(await makeLeague(opened.target, plan, { staffEmail })).toEqual({
        ok: false,
        problem: { kind: 'schema-not-ready' },
      });
      expect((await one<{ n: number }>(old, 'select count(*)::int as n from accounts')).n).toBe(0);
    } finally {
      await opened.target.close();
      await old.close();
    }
  });
});
