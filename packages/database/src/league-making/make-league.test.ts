// Step 2.125 part 1's done test, on PGlite only (T-201): the tool makes a draft league,
// with its first season as the current one, in one step by our staff, for an owner
// whose email has no account yet; when that person first signs in, the account is
// theirs and owns the league. A run that makes no league leaves no account it made.
import { PGlite } from '@electric-sql/pglite';
import { getSeason, planNewLeague, setLeagueName, type NewLeaguePlan } from '@srleagues/core';
import { parseDesignDocument, startingDesign, startingDesignWith } from '@srleagues/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { createDatabase } from '../db/create-database.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { accountForSignIn, findPublishedDesign } from '../queries/index.ts';
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
  if (!opened.ok) throw new Error(JSON.stringify(opened.problem));
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
    staffEmail,
    ...change,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  return result.plan;
}

const countOf = async (text: string, params: unknown[] = []) =>
  (await one<{ n: number }>(pglite, text, params)).n;
const accountCount = () => countOf('select count(*)::int as n from accounts');
const leagueCount = () => countOf('select count(*)::int as n from leagues');

describe('makeLeague', () => {
  it('makes a draft league with its first season as current, in one step by our staff', async () => {
    const plan = planFor({
      ownerEmail: 'new.owner@example.test',
      seasonStartsOn: '2026-09-01',
      seasonEndsOn: '2027-02-28',
    });
    expect(await previewNewLeague(target, plan)).toEqual({
      ready: true,
      shortNameHeld: false,
      owner: 'none',
      staff: 'none',
    });

    const outcome = await makeLeague(target, plan);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const { leagueId, seasonId, ownerAccountId } = outcome.made;
    expect(outcome.made.owner).toBe('none');
    // What it made, read back for the person to see: nothing for them to query.
    expect(outcome.made.readBack).toEqual({
      league: { slug: plan.slug, status: 'draft' },
      seasons: [{ name: 'Fall 2026', status: 'draft', isCurrent: true }],
      log: [
        { action: 'leagues.create', actorEmail: staffEmail },
        { action: 'leagues.create_season', actorEmail: staffEmail },
      ],
      owner: { email: 'new.owner@example.test', signedUp: false },
      staffGrants: 0,
    });

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
        `select s.name, s.slug, s.status, s.is_current, s.starts_on::text as starts_on,
                s.ends_on::text as ends_on, p.is_default, p.sport_key
         from seasons s join programs p on p.id = s.program_id where s.id = $1`,
        [seasonId],
      ),
    ).toEqual({
      name: 'Fall 2026',
      slug: 'fall-2026',
      status: 'draft',
      is_current: true,
      starts_on: '2026-09-01',
      ends_on: '2027-02-28',
      is_default: true,
      sport_key: 'basketball',
    });
    // The owner's account waits, with no name and no sign-in, for its first sign-in.
    expect(
      await one(pglite, 'select email, display_name, sign_in_id from accounts where id = $1', [
        ownerAccountId,
      ]),
    ).toEqual({ email: 'new.owner@example.test', display_name: null, sign_in_id: null });
    // The league and its season are both in the log under our staff: nothing under the
    // owner, who has never signed in.
    const staffId = (
      await one<{ id: string }>(pglite, 'select id from accounts where email = $1', [staffEmail])
    ).id;
    const { rows } = await pglite.query<{ action: string; actor_account_id: string }>(
      `select action, actor_account_id from activity_log where league_id = $1 order by at, id`,
      [leagueId],
    );
    expect(rows).toEqual([
      { action: 'leagues.create', actor_account_id: staffId },
      { action: 'leagues.create_season', actor_account_id: staffId },
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
    expect(await getSeason({ ...asOwner, accountId: staffId }, { seasonId }, deps)).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
  });

  it('uses the accounts already there, whatever the capitals of their emails', async () => {
    const ownerId = await newAccount(pglite, 'Has.Account@example.test');
    const plan = planFor({
      ownerEmail: 'has.account@EXAMPLE.test',
      staffEmail: 'STAFF@example.test',
    });
    expect(await previewNewLeague(target, plan)).toMatchObject({
      owner: 'never-signed-in',
      staff: 'never-signed-in',
    });
    const before = await accountCount();
    const outcome = await makeLeague(target, plan);
    expect(outcome).toMatchObject({ ok: true, made: { ownerAccountId: ownerId } });
    expect(await accountCount()).toBe(before);
  });

  it('tells an account made earlier that nobody signed in with from one somebody has', async () => {
    // A first run made the owner's account; the league was made. Nobody has signed in.
    const first = planFor({ ownerEmail: 'waiting.owner@example.test' });
    expect((await makeLeague(target, first)).ok).toBe(true);
    const again = planFor({ ownerEmail: 'waiting.owner@example.test' });
    expect(await previewNewLeague(target, again)).toMatchObject({ owner: 'never-signed-in' });
    expect(await makeLeague(target, again)).toMatchObject({
      ok: true,
      made: { owner: 'never-signed-in' },
    });
    // Once somebody signs in with it, it is an account somebody signed up with.
    await withTransaction(target.db, {}, (scope) =>
      accountForSignIn(scope, 'made-up-sign-in-user-2', 'waiting.owner@example.test'),
    );
    const third = planFor({ ownerEmail: 'waiting.owner@example.test' });
    expect(await previewNewLeague(target, third)).toMatchObject({ owner: 'signed-up' });
    expect(await makeLeague(target, third)).toMatchObject({
      ok: true,
      made: { owner: 'signed-up' },
    });
  });

  it('lets our staff member be the owner too', async () => {
    const plan = planFor({
      ownerEmail: 'staff.owner@example.test',
      staffEmail: 'staff.owner@example.test',
      whoPlays: 'under-18s',
    });
    const outcome = await makeLeague(target, plan);
    expect(outcome).toMatchObject({ ok: true, made: { owner: 'none' } });
    if (!outcome.ok) return;
    expect(
      await one(pglite, 'select audience, listed from leagues where id = $1', [
        outcome.made.leagueId,
      ]),
    ).toEqual({ audience: 'youth', listed: false });
  });

  it('makes the listing the plan chose', async () => {
    const plan = planFor({ whoPlays: 'under-18s', listed: 'yes' });
    const outcome = await makeLeague(target, plan);
    if (!outcome.ok) throw new Error(JSON.stringify(outcome));
    expect(
      await one(pglite, 'select listed from leagues where id = $1', [outcome.made.leagueId]),
    ).toEqual({ listed: true });
  });

  it('saves the first season with the clock and the mercy rule asked (S-106, step 2.245)', async () => {
    const plan = planFor({ clock: 'stop', mercyLead: '20' });
    const outcome = await makeLeague(target, plan);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const saved = await one(pglite, 'select rules from seasons where id = $1', [
      outcome.made.seasonId,
    ]);
    expect(saved).toMatchObject({
      rules: { clock: { mode: 'stop', mercyLead: 20, stopClockLastSeconds: null } },
    });
  });

  it('gives the league the starting design and colors it was given, as its first release (step 2.187)', async () => {
    const plan = planFor({
      design: 'Midnight-Gold',
      mainColor: '#0A3D62',
      highlightColor: '#ffcc00',
    });
    const outcome = await makeLeague(target, plan);
    if (!outcome.ok) throw new Error(JSON.stringify(outcome));
    const { leagueId } = outcome.made;
    // What its pages are drawn from: its latest release, read as the web app reads it.
    const published = await withTransaction(target.db, { leagueId }, findPublishedDesign, {
      snapshot: 'page',
    });
    const expected = startingDesignWith('midnight-gold', {
      primary: '#0a3d62',
      highlight: '#ffcc00',
    });
    expect(published).toEqual({ number: 1, startingDesign: 'midnight-gold', design: expected });
    expect(parseDesignDocument(published?.design)).toEqual({ ok: true, design: expected });
    // Published by our staff member, in the same step: the log has no entry of its own.
    expect(outcome.made.readBack?.log).toEqual([
      { action: 'leagues.create', actorEmail: staffEmail },
      { action: 'leagues.create_season', actorEmail: staffEmail },
    ]);
  });

  it('gives a league made without a design the first starting design, crest, never the neutral one (C-16)', async () => {
    const outcome = await makeLeague(target, planFor());
    if (!outcome.ok) throw new Error(JSON.stringify(outcome));
    const { leagueId } = outcome.made;
    expect(
      await one(
        pglite,
        'select number, starting_design, design from site_releases where league_id = $1',
        [leagueId],
      ),
    ).toEqual({ number: 1, starting_design: 'crest', design: startingDesign('crest') });
    // What its public pages are drawn from, read as the web app reads it: crest's main color.
    const published = await withTransaction(target.db, { leagueId }, findPublishedDesign, {
      snapshot: 'page',
    });
    const drawn = parseDesignDocument(published?.design);
    if (!drawn.ok) throw new Error(drawn.problems.join('; '));
    expect(drawn.design.colors.primary).toBe('#96062d');
    expect(drawn.design.colors.primary).not.toBe(startingDesign('clean-court').colors.primary);
  });

  it('makes nothing, not even an account, when the short name is held', async () => {
    const first = planFor();
    expect((await makeLeague(target, first)).ok).toBe(true);
    const again = planFor({
      shortName: first.slug,
      ownerEmail: 'nobody.yet@example.test',
      staffEmail: 'staff.nobody@example.test',
    });
    expect(await previewNewLeague(target, again)).toMatchObject({ shortNameHeld: true });
    const accounts = await accountCount();
    const leagues = await leagueCount();
    expect(await makeLeague(target, again)).toEqual({
      ok: false,
      problem: { kind: 'short-name-held' },
      accounts: { removed: [], left: [] },
    });
    expect(await accountCount()).toBe(accounts);
    expect(await leagueCount()).toBe(leagues);
  });

  it('when the league is refused, removes the accounts this run made and keeps the others', async () => {
    // An existing owner and a new staff member. A short name that is blocked passes the
    // check of held names but is refused by createLeague, after the accounts were made.
    const ownerId = await newAccount(pglite, 'kept.owner@example.test');
    const plan = {
      ...planFor({ ownerEmail: 'kept.owner@example.test', staffEmail: 'new.staff@example.test' }),
      slug: 'admin',
    };
    const accounts = await accountCount();
    const leagues = await leagueCount();
    const outcome = await makeLeague(target, plan);
    expect(outcome).toMatchObject({
      ok: false,
      problem: { kind: 'refused', code: 'short-name-blocked' },
      accounts: { removed: [{ email: 'new.staff@example.test' }], left: [] },
    });
    expect(await accountCount()).toBe(accounts);
    expect(await leagueCount()).toBe(leagues);
    expect(await countOf('select count(*)::int as n from accounts where id = $1', [ownerId])).toBe(
      1,
    );
  });

  it('makes no league and no season when the season is refused: all in one step', async () => {
    // A season short name longer than seasons.slug allows: createLeague refuses it.
    const plan = {
      ...planFor({ ownerEmail: 'season.refused@example.test' }),
      season: { name: 'Fall 2026', slug: 'x'.repeat(61), startsOn: null, endsOn: null },
    };
    const accounts = await accountCount();
    const leagues = await leagueCount();
    const seasons = await countOf('select count(*)::int as n from seasons');
    expect(await makeLeague(target, plan)).toMatchObject({
      ok: false,
      problem: { kind: 'refused', code: 'invalid-input' },
      accounts: { removed: [{ email: 'season.refused@example.test' }], left: [] },
    });
    expect(await leagueCount()).toBe(leagues);
    expect(await countOf('select count(*)::int as n from seasons')).toBe(seasons);
    expect(await accountCount()).toBe(accounts);
  });

  it('says what was made when something unexpected stops it, and never throws', async () => {
    // The commands' side reaches a database that is already closed: the command's
    // transaction cannot start, after the login made the accounts.
    const gone = new PGlite();
    const dead = createDatabase({ kind: 'pglite', pglite: gone });
    await gone.close();
    const broken: LeagueMakingTarget = { ...target, db: dead };
    const plan = planFor({ ownerEmail: 'broken.run@example.test' });
    const accounts = await accountCount();
    const outcome = await makeLeague(broken, plan);
    await dead.close().catch(() => {});
    expect(outcome).toMatchObject({
      ok: false,
      problem: { kind: 'failed', league: 'not-made' },
      accounts: { removed: [{ email: 'broken.run@example.test' }], left: [] },
    });
    expect(await accountCount()).toBe(accounts);
  });

  it('never says "not made" when the league may have landed and a fresh read cannot be made', async () => {
    // The command fails with its outcome uncertain, and no new connection can be
    // opened to look: the league is "not known", and no account is removed.
    const gone = new PGlite();
    const dead = createDatabase({ kind: 'pglite', pglite: gone });
    await gone.close();
    const blind: LeagueMakingTarget = {
      ...target,
      db: dead,
      freshLogin: async () => {
        throw Object.assign(new Error('made-up: no new connection'), { code: 'ECONNRESET' });
      },
    };
    const plan = planFor({
      ownerEmail: 'unknown.owner@example.test',
      staffEmail: 'unknown.staff@example.test',
    });
    const outcome = await makeLeague(blind, plan);
    await dead.close().catch(() => {});
    expect(outcome).toMatchObject({
      ok: false,
      problem: { kind: 'failed', league: 'unknown' },
      accounts: {
        removed: [],
        left: [{ email: 'unknown.staff@example.test' }, { email: 'unknown.owner@example.test' }],
      },
    });
    expect(
      await countOf('select count(*)::int as n from accounts where email like $1', [
        'unknown.%@example.test',
      ]),
    ).toBe(2);
  });

  it('finds an account whose own commit landed with its reply lost, and removes it', async () => {
    // The owner's account is made and committed, then the reply is lost: the run never
    // learned it was made. Nothing else ran, so the league is surely not made.
    let calls = 0;
    const lossy: LeagueMakingTarget = {
      ...target,
      login: {
        ...target.login,
        transaction: async (work) => {
          const result = await target.login.transaction(work);
          calls += 1;
          // The first is the staff member's account (already there), the second the owner's.
          if (calls === 2)
            throw Object.assign(new Error('made-up: reply lost'), { code: 'ECONNRESET' });
          return result;
        },
      },
    };
    const plan = planFor({ ownerEmail: 'lost.reply@example.test' });
    const accounts = await accountCount();
    const outcome = await makeLeague(lossy, plan);
    expect(outcome).toMatchObject({
      ok: false,
      problem: { kind: 'failed', league: 'not-made', reason: 'ECONNRESET' },
      accounts: { removed: [{ email: 'lost.reply@example.test' }], left: [] },
    });
    expect(await accountCount()).toBe(accounts);
  });
});

describe('makeLeague when a login may not do its part', () => {
  it('refuses before the plan and again before anything is made: no account, no league', async () => {
    // The commands under a login of their own, which here is the superuser PGlite
    // logs in as: the app's login check (T-60) refuses it. Before this check the tool
    // made the accounts and then failed after "yes" with nothing but a code.
    const own: LeagueMakingTarget = { ...target, appLogin: 'own' };
    const plan = planFor({
      ownerEmail: 'probe.refused@example.test',
      staffEmail: 'probe.staff@example.test',
    });
    const accounts = await accountCount();
    const leagues = await leagueCount();
    const superuser = 'postgres is a superuser: alter role postgres nosuperuser';
    expect(await previewNewLeague(own, plan)).toEqual({
      ready: false,
      problem: {
        kind: 'login',
        problems: [{ login: 'app', problems: expect.arrayContaining([superuser]) }],
      },
    });
    expect(await makeLeague(own, plan)).toEqual({
      ok: false,
      problem: {
        kind: 'login',
        problems: [{ login: 'app', problems: expect.arrayContaining([superuser]) }],
      },
      accounts: { removed: [], left: [] },
    });
    expect(await accountCount()).toBe(accounts);
    expect(await leagueCount()).toBe(leagues);
  });
});

describe('makeLeague on a database not at this code’s migrations', () => {
  const refusedOn = async (db: PGlite) => {
    const opened = await openLeagueMakingTarget({ kind: 'pglite', pglite: db });
    if (!opened.ok) throw new Error(JSON.stringify(opened.problem));
    try {
      const plan = planFor();
      const preview = await previewNewLeague(opened.target, plan);
      const outcome = await makeLeague(opened.target, plan);
      return { preview, outcome };
    } finally {
      await opened.target.close();
    }
  };

  it('refuses one with no migrations at all, in plain words, not with a crash', async () => {
    const empty = new PGlite();
    try {
      expect(await refusedOn(empty)).toEqual({
        preview: { ready: false, problem: { kind: 'migrations', state: 'none' } },
        outcome: {
          ok: false,
          problem: { kind: 'migrations', state: 'none' },
          accounts: { removed: [], left: [] },
        },
      });
    } finally {
      await empty.close();
    }
  });

  it('refuses one behind this code (its newest migration not applied), making nothing', async () => {
    const old = await freshSchema();
    try {
      await old.exec(
        'delete from migration_log.applied where version = (select max(version) from migration_log.applied)',
      );
      const accounts = (await one<{ n: number }>(old, 'select count(*)::int as n from accounts')).n;
      expect(await refusedOn(old)).toMatchObject({
        preview: { ready: false, problem: { kind: 'migrations', state: 'behind' } },
        outcome: { ok: false, problem: { kind: 'migrations', state: 'behind' } },
      });
      expect((await one<{ n: number }>(old, 'select count(*)::int as n from accounts')).n).toBe(
        accounts,
      );
    } finally {
      await old.close();
    }
  });

  it('refuses one ahead of this code (a migration newer than its newest), making nothing', async () => {
    const newer = await freshSchema();
    try {
      await newer.exec(
        `insert into migration_log.applied (version, name, checksum)
         values (9999, '9999_from_a_later_version.sql', repeat('0', 64))`,
      );
      expect(await refusedOn(newer)).toMatchObject({
        preview: { ready: false, problem: { kind: 'migrations', state: 'ahead' } },
        outcome: { ok: false, problem: { kind: 'migrations', state: 'ahead' } },
      });
      expect((await one<{ n: number }>(newer, 'select count(*)::int as n from leagues')).n).toBe(0);
    } finally {
      await newer.close();
    }
  });
});
