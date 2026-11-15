// The seed of the one made-up world holds at every hour (step 2.152): made every ten minutes
// across two days that take in the autumn clock change of the first league's zone, every
// game already played is in the past, the game under way has started and is on the
// scorekeeper's list, exactly one round of each current season is dated the league's today,
// and every game and round the browser tests name is there as they expect it.
import { describe, expect, it } from 'vitest';
import { standInPeople, standInSeedCast } from './stand-in-cast.ts';
import { dayIn } from './stand-in-world-clock.ts';
import { worldGamesStore } from './stand-in-world-games.ts';
import { madeUpLeagues, standInGameId } from './stand-in-world-seed.ts';

/** Game `index` of the first league's current season's listed games (as the browser tests name them). */
const listedGame = (index: number) =>
  `01900000-0000-7000-8000-0000${(0xb2000000 + 13 * 1000 + index).toString(16)}`;

/** Every ten minutes from 30 October 23:00 UTC to 2 November 07:00 UTC: Chicago falls back on 1 November. */
const moments = (() => {
  const all: Date[] = [];
  for (let t = Date.UTC(2026, 9, 30, 23, 0); t <= Date.UTC(2026, 10, 2, 7, 0); t += 600_000) {
    all.push(new Date(t));
  }
  return all;
})();

describe('the made-up world’s seed, at every hour', () => {
  it('has the game under way listed, the games played in the past, and one round today', async () => {
    expect(moments.length).toBeGreaterThan(280);
    for (const now of moments) {
      const at = now.toISOString();
      for (const league of madeUpLeagues(standInSeedCast, now)) {
        const today = dayIn(now, league.timeZone);
        for (const game of league.games) {
          if (game.status === 'final' || game.status === 'forfeit') {
            expect(game.startsAt !== null && game.startsAt <= at, `${at} ${game.id} played`).toBe(
              true,
            );
          }
        }
        if (league.currentSeasonId === null) continue;
        const rounds = league.rounds.filter(
          (r) => r.seasonId === league.currentSeasonId && r.date === today,
        );
        expect(rounds, `${at} ${league.slug} rounds today`).toHaveLength(1);
        const window = await worldGamesStore(league, () => now).listWindow(
          standInPeople.scorekeeper.accountId,
          7,
        );
        for (const live of league.games.filter((g) => g.status === 'live')) {
          expect(live.startsAt !== null && live.startsAt <= at, `${at} ${live.id} under way`).toBe(
            true,
          );
          expect(
            window.games.some((g) => g.game.id === live.id),
            `${at} ${league.slug} lists ${live.id}`,
          ).toBe(true);
        }
      }
    }
  });

  it('keeps every game the browser tests name, at every hour', async () => {
    for (const now of moments) {
      const at = now.toISOString();
      const [adult] = madeUpLeagues(standInSeedCast, now);
      if (adult === undefined) throw new Error('no adult league');
      const status = (id: string) => adult.games.find((g) => g.id === id)?.status;
      expect(
        [1, 2, 3, 4, 5, 6].map((n) => status(standInGameId(n))),
        at,
      ).toEqual(['scheduled', 'live', 'scheduled', 'scheduled', 'final', 'scheduled']);
      expect(
        [0, 1, 3, 6, 7, 8].map((i) => status(listedGame(i))),
        at,
      ).toEqual(['final', 'forfeit', 'postponed', 'final', 'scheduled', 'scheduled']);
      // The tracker test's week: the game under way, today's games still to play and the
      // days ahead are always on the list; the two played today are when they fell today.
      const window = await worldGamesStore(adult, () => now).listWindow(
        standInPeople.scorekeeper.accountId,
        7,
      );
      const listed = window.games.map((g) => g.game.id);
      for (const id of [
        standInGameId(2),
        listedGame(7),
        standInGameId(1),
        listedGame(8),
        standInGameId(3),
        standInGameId(4),
      ]) {
        expect(listed, `${at} lists ${id}`).toContain(id);
      }
    }
  });
});
