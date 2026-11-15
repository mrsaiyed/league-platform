// The made-up schedule holds no clash at any hour (step 2.179): the world is made at every
// minute around the one GitHub failed at (2026-11-15 20:01 UTC) and at every ten minutes
// across a week that takes in a month's end and the autumn clock change, and each made-up
// league's current season is read as Admin → Schedule reads it (core's getScheduleDraft,
// whose clash rule is findClashes, and the grid's own rows, build-grid.ts). No clash, no
// change refused, no game outside the season's rounds or outside its own round's days by
// the grid's rule, exactly one round dated today, every
// finished game in the past, and the game under way started and on the scorekeeper's list.
import { getScheduleDraft, type ScheduleDraftView } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { buildGrid } from '../features/schedule-builder/build-grid.ts';
import { standInPeople } from './stand-in-cast.ts';
import { dayIn } from './stand-in-world-clock.ts';
import { worldGamesStore } from './stand-in-world-games.ts';
import { standInSchedule } from './stand-in-schedule.ts';
import type { LeagueWorld } from './stand-in-world-state.ts';
import { testWorld } from './stand-in-world.test-helper.ts';

const minute = 60_000;

/** A stretch of time the world is made at, every `step` minutes from `from` up to `to`. */
type Window = { readonly name: string; readonly from: string; readonly to: string; step: number };

/** Each day (UTC) from `first` for `days` days, every ten minutes. */
const daysFrom = (first: string, days: number, why: string): Window[] =>
  Array.from({ length: days }, (_, i) => {
    const from = new Date(Date.parse(`${first}T00:00:00Z`) + i * 86_400_000);
    const to = new Date(from.getTime() + 86_400_000);
    const day = from.toISOString().slice(0, 10);
    return { name: `${day}, ${why}`, from: from.toISOString(), to: to.toISOString(), step: 10 };
  });

/**
 * The stretches the world is made in, one test each so none comes near the time limit: the
 * hour GitHub failed in, every minute; a week with a month's end and the autumn clock change
 * (Chicago and Los Angeles fall back on 1 November), day by day, every ten minutes, and that
 * clock-change night every minute; the spring clock change (14 March 2027) and a year's end,
 * day by day, every ten minutes.
 */
const windows: readonly Window[] = [
  {
    name: 'the hour GitHub failed in, every minute',
    from: '2026-11-15T19:30:00Z',
    to: '2026-11-15T20:31:00Z',
    step: 1,
  },
  ...daysFrom('2026-10-29', 7, 'a week with a month’s end and the autumn clock change'),
  {
    name: 'the autumn clock-change night, every minute',
    from: '2026-11-01T05:00:00Z',
    to: '2026-11-01T10:00:00Z',
    step: 1,
  },
  ...daysFrom('2027-03-13', 3, 'the spring clock change'),
  ...daysFrom('2026-12-30', 4, 'a year’s end'),
];

const momentsOf = (w: Window): Date[] => {
  const all: Date[] = [];
  for (let t = Date.parse(w.from); t < Date.parse(w.to); t += w.step * minute)
    all.push(new Date(t));
  return all;
};

/** What is wrong with one season's schedule as the grid reads it, in words; empty when nothing. */
function faultsOf(view: ScheduleDraftView, today: string): string[] {
  const faults: string[] = [];
  const { rounds, games } = view.result;
  for (const clash of view.clashes) faults.push(`clash ${JSON.stringify(clash)}`);
  for (const r of view.rejected) faults.push(`change refused ${JSON.stringify(r)}`);
  // The grid's own rows and flags (build-grid.ts): its clashes, the games in no round, and
  // a game outside its round's days (step 2.160: before the round's date, or on or after
  // the next round's, a week on for the last).
  const grid = buildGrid(view, [], []);
  for (const clash of grid.clashes) faults.push(`the grid lists a clash: ${clash.text}`);
  for (const game of grid.looseGames) {
    faults.push(`game ${game.id} on ${game.date} is in no round of the season`);
  }
  for (const game of grid.allGames) {
    if (game.clashed) faults.push(`game ${game.id} is marked as in a clash`);
    if (game.outsideRound) {
      faults.push(`game ${game.id} on ${game.date} is outside its round's days`);
    }
  }
  for (const game of games) {
    if ((game.status === 'final' || game.status === 'forfeit') && game.date > today) {
      faults.push(`finished game ${game.id} is dated after today`);
    }
  }
  if (rounds.filter((r) => r.date === today).length !== 1) {
    faults.push(`not exactly one round is dated today (${today})`);
  }
  return faults;
}

describe('the made-up schedule, at every hour: no clash and no flag in any league', () => {
  it.each(windows.map((w) => [w.name, w] as const))('%s', async (_name, window) => {
    const moments = momentsOf(window);
    expect(moments.length).toBeGreaterThan(60);
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
