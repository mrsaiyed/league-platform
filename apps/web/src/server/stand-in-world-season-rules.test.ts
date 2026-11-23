// Step 2.47: the made-up world saves a season's rules as the database does, so Season
// settings works on the stand-in. After a result, a change that moves the standings is
// refused with the teams it would move and saves nothing until it is confirmed (S-1);
// confirmed, it is saved and the season's standings are worked out again from the new
// rules. Switching the unique-jersey rule on is refused while a team has a number worn
// twice by players still on it, as the database refuses it (0008, 0015). The command
// refuses a scheduler, and one league's season is never found through another (T-28).
import {
  getSeason,
  setSeasonRules,
  type AccessReader,
  type Grant,
  type SeasonView,
} from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { castId, standInLeagues, standInPeople } from './stand-in-cast.ts';
import { standInSeasonIds } from './stand-in-world-seed.ts';
import { testWorld } from './stand-in-world.test-helper.ts';
import type { World } from './stand-in-world.ts';

const first = standInLeagues.live.id;
const second = standInLeagues.other.id;
const owner = standInPeople.owner.accountId;
const scheduler: Grant = {
  id: castId(0xd47),
  accountId: standInPeople.scheduler.accountId,
  role: 'scheduler',
  scope: { type: 'league' },
  grantedByAccountId: owner,
  revokedAt: null,
};
const accessOf = (leagueId: string): AccessReader => ({
  ownerAccountId: async () => owner,
  leagueStatus: async () => 'live',
  activeGrantsOf: async (account) =>
    leagueId === first && account === scheduler.accountId ? [scheduler] : [],
});
const as = (accountId: string, leagueId = first) => ({ leagueId, accountId, requestId: 'r1' });
/** The first league's current season, with results. */
const fall = standInSeasonIds.adultFall;

async function seasonOf(world: World, seasonId = fall): Promise<SeasonView> {
  const read = await getSeason(as(owner), { seasonId }, world.deps);
  if (!read.ok) throw new Error(`the owner cannot read the season: ${read.error.code}`);
  return read.value;
}

/** The order of a division's table as saved: team ids by rank. */
async function savedOrder(world: World): Promise<string[]> {
  const rows = (await world.read(first))?.standingsRows[fall] ?? [];
  return [...rows].sort((a, b) => a.seed - b.seed).map((row) => `${row.teamId}:${row.seed}`);
}

describe("a season's rules saved on the made-up world", () => {
  it('asks before a change that moves the standings, and saves it once confirmed', async () => {
    const world = testWorld(accessOf);
    const before = await seasonOf(world);
    const orderBefore = await savedOrder(world);
    const rules = { ...before.rules, tiebreakers: ['points-scored' as const] };
    const asked = await setSeasonRules(
      as(owner),
      { seasonId: fall, version: before.version, rules },
      world.deps,
    );
    expect(asked).toMatchObject({ ok: false, error: { code: 'confirmation-needed' } });
    const moves = !asked.ok && asked.error.code === 'confirmation-needed' ? asked.error.moves : [];
    expect(moves.length).toBeGreaterThan(0);
    // Nothing saved: the rules, the version and the table are as they were.
    expect(await seasonOf(world)).toEqual(before);
    expect(await savedOrder(world)).toEqual(orderBefore);

    const saved = await setSeasonRules(
      as(owner),
      { seasonId: fall, version: before.version, rules, confirmed: true },
      world.deps,
    );
    expect(saved).toEqual({ ok: true, value: { version: before.version + 1 } });
    const after = await seasonOf(world);
    expect(after.rules.tiebreakers).toEqual(['points-scored']);
    expect(after.rulesSaved).toBe(true);
    // The table is worked out again under the new rules: each team moved is where it said.
    const order = await savedOrder(world);
    expect(order).not.toEqual(orderBefore);
    const rows = (await world.read(first))?.standingsRows[fall] ?? [];
    for (const move of moves) {
      const seed = move.changes.find((c) => c.field === 'seed');
      if (seed === undefined) continue;
      expect(rows.find((row) => row.teamId === move.teamId)?.seed).toBe(seed.to);
    }
  });

  it('saves game rules at once: they move nothing in the standings', async () => {
    const world = testWorld(accessOf);
    const before = await seasonOf(world);
    const rules = {
      ...before.rules,
      gameFormat: { periods: 4 as const, periodSeconds: 480, overtimeSeconds: 240 },
    };
    expect(
      await setSeasonRules(
        as(owner),
        { seasonId: fall, version: before.version, rules },
        world.deps,
      ),
    ).toEqual({ ok: true, value: { version: before.version + 1 } });
    expect((await seasonOf(world)).rules.gameFormat.periods).toBe(4);
  });

  it('refuses the unique-jersey rule while a number is worn twice on a team', async () => {
    const world = testWorld(accessOf, undefined, (leagues) => {
      const league = leagues.find((l) => l.leagueId === first);
      if (league === undefined) throw new Error('no first league');
      const teams = new Set(league.teams.filter((t) => t.seasonId === fall).map((t) => t.id));
      const [one, two] = league.roster.filter(
        (r) => teams.has(r.teamId) && r.leftOn === null && !r.needsReview,
      );
      if (one === undefined || two === undefined) throw new Error('no roster to change');
      // A second player on the first player's team, wearing the same number.
      league.roster = league.roster.map((r) =>
        r.id === two.id ? { ...r, teamId: one.teamId, jerseyNumber: one.jerseyNumber ?? '4' } : r,
      );
      league.roster = league.roster.map((r) =>
        r.id === one.id ? { ...r, jerseyNumber: one.jerseyNumber ?? '4' } : r,
      );
    });
    const before = await seasonOf(world);
    expect(before.rules.rosters.uniqueJerseys).toBe(false);
    const rules = { ...before.rules, rosters: { ...before.rules.rosters, uniqueJerseys: true } };
    expect(
      await setSeasonRules(
        as(owner),
        { seasonId: fall, version: before.version, rules },
        world.deps,
      ),
    ).toEqual({ ok: false, error: { code: 'unique-jerseys-clash' } });
    expect(await seasonOf(world)).toEqual(before);
  });

  it("refuses a scheduler, and never finds another league's season", async () => {
    const world = testWorld(accessOf);
    const before = await seasonOf(world);
    const rules = { ...before.rules, allowTies: true };
    expect(
      await setSeasonRules(
        as(scheduler.accountId),
        { seasonId: fall, version: before.version, rules },
        world.deps,
      ),
    ).toEqual({ ok: false, error: { code: 'not-allowed' } });
    const there = await setSeasonRules(
      as(owner, second),
      { seasonId: fall, version: before.version, rules },
      world.deps,
    );
    expect(there.ok).toBe(false);
    expect(await seasonOf(world)).toEqual(before);
  });
});
