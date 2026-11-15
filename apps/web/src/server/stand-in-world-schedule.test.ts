// The made-up schedule holds no clash at any hour (step 2.179): the world is made at every
// minute around the one GitHub failed at (2026-11-15 20:01 UTC) and at every ten minutes
// across a week that takes in a month's end and the autumn clock change, and each made-up
// league's current season is read as Admin → Schedule reads it (core's getScheduleDraft,
// whose clash rule is findClashes). No clash, no change refused, no game outside the
// season's rounds or outside its own round's days, exactly one round dated today, every
// finished game in the past, and the game under way started and on the scorekeeper's list.
import { getScheduleDraft, type ScheduleDraftView } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { standInPeople } from './stand-in-cast.ts';
import { dayIn } from './stand-in-world-clock.ts';
import { worldGamesStore } from './stand-in-world-games.ts';
import { standInSchedule } from './stand-in-schedule.ts';
import type { LeagueWorld } from './stand-in-world-state.ts';
import { testWorld } from './stand-in-world.test-helper.ts';

const minute = 60_000;

/** Every minute from 19:30 to 20:30 UTC on 15 November, then every ten minutes of a week. */
const moments = (() => {
  const all: Date[] = [];
  for (let t = Date.UTC(2026, 10, 15, 19, 30); t <= Date.UTC(2026, 10, 15, 20, 30); t += minute) {
    all.push(new Date(t));
  }
  // 29 October to 5 November: Chicago and Los Angeles both fall back on 1 November.
  for (let t = Date.UTC(2026, 9, 29, 0, 0); t < Date.UTC(2026, 10, 5, 0, 0); t += 10 * minute) {
    all.push(new Date(t));
  }
  return all;
})();

/** What is wrong with one season's schedule as the grid reads it, in words; empty when nothing. */
function faultsOf(view: ScheduleDraftView, today: string): string[] {
  const faults: string[] = [];
  const { rounds, games } = view.result;
  for (const clash of view.clashes) faults.push(`clash ${JSON.stringify(clash)}`);
  for (const r of view.rejected) faults.push(`change refused ${JSON.stringify(r)}`);
  for (const game of games) {
    const round = rounds.find((r) => r.id === game.roundId);
    if (round === undefined) {
      faults.push(`game ${game.id} on ${game.date} is in no round of the season`);
      continue;
    }
    // A round holds the days from its own date to the day before the next round's.
    const next = rounds.find((r) => r.date !== null && round.date !== null && r.date > round.date);
    if (round.date !== null && game.date < round.date) {
      faults.push(`game ${game.id} on ${game.date} is before its round's date ${round.date}`);
    }
    if (next?.date != null && game.date >= next.date) {
      faults.push(`game ${game.id} on ${game.date} is in the next round's days (${next.date})`);
    }
    if ((game.status === 'final' || game.status === 'forfeit') && game.date > today) {
      faults.push(`finished game ${game.id} is dated after today`);
    }
  }
  if (rounds.filter((r) => r.date === today).length !== 1) {
    faults.push(`not exactly one round is dated today (${today})`);
  }
  return faults;
}

describe('the made-up schedule, at every hour', () => {
  it('has no clash and no flag in any made-up league with a schedule', async () => {
    expect(moments.length).toBeGreaterThan(1000);
    const faults: string[] = [];
    let read = 0;
    for (const now of moments) {
      const at = now.toISOString();
      let leagues: readonly LeagueWorld[] = [];
      const world = testWorld(
        undefined,
        () => now,
        (made) => (leagues = made),
      );
      const { deps } = standInSchedule(world);
      for (const league of leagues) {
        const seasonId = league.currentSeasonId;
        if (seasonId === null || !league.rounds.some((r) => r.seasonId === seasonId)) continue;
        const where = `${at} ${league.slug}`;
        const context = {
          leagueId: league.leagueId,
          accountId: standInPeople.owner.accountId,
          requestId: 'every-hour',
        };
        const got = await getScheduleDraft(context, { seasonId }, deps);
        if (!got.ok) throw new Error(`${where}: ${got.error.code}`);
        read += 1;
        faults.push(
          ...faultsOf(got.value, dayIn(now, league.timeZone)).map((f) => `${where} ${f}`),
        );
        const listed = await worldGamesStore(league, () => now).listWindow(
          standInPeople.scorekeeper.accountId,
          7,
        );
        for (const game of league.games.filter((g) => g.seasonId === seasonId)) {
          const started = game.startsAt !== null && game.startsAt <= at;
          if (['final', 'forfeit', 'live'].includes(game.status) && !started) {
            faults.push(`${where} ${game.status} game ${game.id} has not started`);
          }
          if (game.status === 'live' && !listed.games.some((g) => g.game.id === game.id)) {
            faults.push(`${where} the game under way ${game.id} is not on the scorekeeper's list`);
          }
        }
      }
    }
    // The three made-up leagues with a schedule, at every moment.
    expect(read).toBe(moments.length * 3);
    expect(faults).toEqual([]);
  });
});
