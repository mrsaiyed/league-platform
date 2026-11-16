// Step 2.182 on PGlite only (T-201): a league made by the league-making command starts with
// its first season hidden (A-18), and its owner shows it, and hides it again, through the
// season command that Admin → Season settings runs (update-season): visitors' list of
// seasons gains it and loses it again. The screen itself does not run on the database yet
// (the web app's League settings and schedule ports refuse there until step 2.93 moves
// them), so the command is tested here, on the database's own stores. Another league's
// owner never reaches the season (isolation).
import { PGlite } from '@electric-sql/pglite';
import { getSeason, planNewLeague, updateSeason, type NewLeaguePlan } from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandTransaction } from '../db/command-transaction.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { accountForSignIn, findPublicSeason, listPublicSeasons } from '../queries/index.ts';
import { freshSchema, unique } from '../schema/schema.test-helper.ts';
import { accessStore } from '../stores/access-store.ts';
import { activityLogStore } from '../stores/activity-log-store.ts';
import { divisionsStore } from '../stores/divisions-store.ts';
import { jobsStore } from '../stores/jobs-store.ts';
import { leaguesStore } from '../stores/leagues-store.ts';
import { openLeagueMakingTarget, type LeagueMakingTarget } from './league-making-target.ts';
import { makeLeague } from './make-league.ts';

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

function planFor(ownerEmail: string): NewLeaguePlan {
  const result = planNewLeague({
    name: 'Made-up Hoops',
    shortName: unique('hoops'),
    sport: 'basketball',
    whoPlays: 'adults',
    city: 'Springfield',
    timeZone: 'America/Chicago',
    contactEmail: 'hello@example.test',
    ownerEmail,
    seasonName: 'Fall 2026',
    staffEmail: 'staff@example.test',
  });
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  return result.plan;
}

/** A made-up league with its owner signed up: its id, its first season's and the owner's. */
async function madeLeague(n: number) {
  const email = `${unique(`owner-${n}`)}@example.test`;
  const outcome = await makeLeague(target, planFor(email));
  if (!outcome.ok) throw new Error('the league was not made');
  const accountId = await withTransaction(target.db, {}, (scope) =>
    accountForSignIn(scope, `made-up-sign-in-user-${unique('u')}`, email),
  );
  return { leagueId: outcome.made.leagueId, seasonId: outcome.made.seasonId, accountId };
}

const deps = () => ({
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
});

const publicSlugs = (leagueId: string) =>
  withTransaction(target.db, { leagueId }, async (scope) =>
    (await listPublicSeasons(scope)).map((s) => s.slug),
  );

describe("a new league's first season, shown and hidden by its owner", () => {
  it('starts hidden, is shown to visitors after "show" and hidden again after "hide"', async () => {
    const { leagueId, seasonId, accountId } = await madeLeague(1);
    const asOwner = { leagueId, accountId, requestId: 'r-1' };
    const read = await getSeason(asOwner, { seasonId }, deps());
    expect(read).toMatchObject({ ok: true, value: { status: 'draft', slug: 'fall-2026' } });
    if (!read.ok) return;
    expect(await publicSlugs(leagueId)).toEqual([]);

    const shown = await updateSeason(
      asOwner,
      { seasonId, version: read.value.version, status: 'active' },
      deps(),
    );
    expect(shown).toEqual({ ok: true, value: { version: read.value.version + 1 } });
    expect(await publicSlugs(leagueId)).toEqual(['fall-2026']);
    expect(
      await withTransaction(target.db, { leagueId }, (scope) =>
        findPublicSeason(scope, { seasonSlug: 'fall-2026' }),
      ),
    ).toMatchObject({ slug: 'fall-2026', status: 'active', isCurrent: true });

    const hidden = await updateSeason(
      asOwner,
      { seasonId, version: read.value.version + 1, status: 'draft' },
      deps(),
    );
    expect(hidden).toEqual({ ok: true, value: { version: read.value.version + 2 } });
    expect(await publicSlugs(leagueId)).toEqual([]);
    expect(
      await withTransaction(target.db, { leagueId }, (scope) =>
        findPublicSeason(scope, { seasonSlug: 'fall-2026' }),
      ),
    ).toBeUndefined();
  });

  it("never lets another league's owner reach the season", async () => {
    const first = await madeLeague(2);
    const other = await madeLeague(3);
    const asOther = { leagueId: other.leagueId, accountId: other.accountId, requestId: 'r-2' };
    expect(await getSeason(asOther, { seasonId: first.seasonId }, deps())).toMatchObject({
      ok: false,
      error: { code: 'season-not-found' },
    });
    expect(
      await updateSeason(
        asOther,
        { seasonId: first.seasonId, version: 1, status: 'active' },
        deps(),
      ),
    ).toMatchObject({ ok: false, error: { code: 'season-not-found' } });
    // The owner of the first league, asking through the other league, is not its owner there.
    const crossed = { leagueId: other.leagueId, accountId: first.accountId, requestId: 'r-3' };
    expect(
      await updateSeason(
        crossed,
        { seasonId: other.seasonId, version: 1, status: 'active' },
        deps(),
      ),
    ).toMatchObject({ ok: false, error: { code: 'not-allowed' } });
    expect(await publicSlugs(first.leagueId)).toEqual([]);
    expect(await publicSlugs(other.leagueId)).toEqual([]);
  });
});
