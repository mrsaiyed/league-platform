// Step 2.182: the made-up world lets the season command work, as the database does. A
// season the owner shows (draft to active) is listed for visitors with its published games;
// hidden again (active to draft) it is gone. The version is checked and raised, the
// command refuses a scheduler and a scorekeeper, and one league's season is never found
// through another league (T-28).
import { getSeason, updateSeason, type AccessReader, type Grant } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { castId, standInLeagues, standInPeople } from './stand-in-cast.ts';
import { worldPublicSchedule, worldPublicSeasons } from './stand-in-world-reads.ts';
import { standInGameId, standInSeasonIds } from './stand-in-world-seed.ts';
import { testWorld } from './stand-in-world.test-helper.ts';

const first = standInLeagues.live.id;
const second = standInLeagues.other.id;
const owner = standInPeople.owner.accountId;
const grantOf = (accountId: string, role: Grant['role'], n: number): Grant => ({
  id: castId(0xd00 + n),
  accountId,
  role,
  scope: { type: 'league' },
  grantedByAccountId: owner,
  revokedAt: null,
});
const grants = [
  grantOf(standInPeople.scheduler.accountId, 'scheduler', 1),
  grantOf(standInPeople.scorekeeper.accountId, 'scorekeeper', 2),
];
const accessOf = (leagueId: string): AccessReader => ({
  ownerAccountId: async () => owner,
  leagueStatus: async () => 'live',
  activeGrantsOf: async (account) =>
    leagueId === first ? grants.filter((g) => g.accountId === account) : [],
});
const as = (accountId: string, leagueId = first) => ({ leagueId, accountId, requestId: 'r1' });
const winter = standInSeasonIds.adultNext;

describe('a season shown and hidden on the made-up world', () => {
  it('lists the shown season and its published games for visitors, and drops it when hidden', async () => {
    const world = testWorld(accessOf);
    const listed = async () => worldPublicSeasons(await world.read(first)).map((x) => x.slug);
    const schedule = async () => worldPublicSchedule(await world.read(first), winter, '2027-01-01');
    expect(await listed()).not.toContain('winter-2027');
    expect(await schedule()).toBeUndefined();

    const read = await getSeason(as(owner), { seasonId: winter }, world.deps);
    expect(read).toMatchObject({ ok: true, value: { status: 'draft', isCurrent: false } });
    const version = read.ok ? read.value.version : 0;
    const shown = await updateSeason(
      as(owner),
      { seasonId: winter, version, status: 'active' },
      world.deps,
    );
    expect(shown).toEqual({ ok: true, value: { version: version + 1 } });
    expect(await listed()).toContain('winter-2027');
    expect((await schedule())?.unplacedGames.map((g) => g.id)).toEqual([standInGameId(6)]);
    // Showing it does not make it the current season.
    expect((await world.read(first))?.currentSeasonId).not.toBe(winter);

    // The same version again is someone else's save in between (A-8).
    expect(
      await updateSeason(as(owner), { seasonId: winter, version, status: 'draft' }, world.deps),
    ).toMatchObject({ ok: false, error: { code: 'changed-since-read' } });
    const hidden = await updateSeason(
      as(owner),
      { seasonId: winter, version: version + 1, status: 'draft' },
      world.deps,
    );
    expect(hidden).toEqual({ ok: true, value: { version: version + 2 } });
    expect(await listed()).not.toContain('winter-2027');
    expect(await schedule()).toBeUndefined();
  });

  it('moves the current mark as the database does', async () => {
    const world = testWorld(accessOf);
    const before = await getSeason(as(owner), { seasonId: winter }, world.deps);
    const version = before.ok ? before.value.version : 0;
    await updateSeason(as(owner), { seasonId: winter, version, current: true }, world.deps);
    expect((await world.read(first))?.currentSeasonId).toBe(winter);
    await updateSeason(
      as(owner),
      { seasonId: winter, version: version + 1, current: false },
      world.deps,
    );
    expect((await world.read(first))?.currentSeasonId).toBeNull();
  });

  it('refuses a scheduler and a scorekeeper, and changes nothing', async () => {
    const world = testWorld(accessOf);
    for (const who of [standInPeople.scheduler, standInPeople.scorekeeper]) {
      expect(
        await updateSeason(
          as(who.accountId),
          { seasonId: winter, version: 1, status: 'active' },
          world.deps,
        ),
      ).toMatchObject({ ok: false, error: { code: 'not-allowed' } });
      expect(await getSeason(as(who.accountId), { seasonId: winter }, world.deps)).toMatchObject({
        ok: false,
        error: { code: 'not-allowed' },
      });
    }
    expect((await world.read(first))?.seasons.find((x) => x.id === winter)?.status).toBe('draft');
  });

  it("never finds one league's season through another league", async () => {
    const world = testWorld(accessOf);
    expect(await getSeason(as(owner, second), { seasonId: winter }, world.deps)).toMatchObject({
      ok: false,
      error: { code: 'season-not-found' },
    });
    expect(
      await updateSeason(
        as(owner, second),
        { seasonId: winter, version: 1, status: 'active' },
        world.deps,
      ),
    ).toMatchObject({ ok: false, error: { code: 'season-not-found' } });
    expect((await world.read(first))?.seasons.find((x) => x.id === winter)?.status).toBe('draft');
  });
});
