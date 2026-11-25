// The seed of the one made-up world holds at every hour (step 2.152): made every ten minutes
// across two days that take in the autumn clock change of the first league's zone, every
// game already played is in the past, the game under way has started and is on the
// scorekeeper's list, exactly one round of each current season is dated the league's today,
// and every game and round the browser tests name is there as they expect it.
import { SEASON_RULES_PRESETS, SeasonRules, seasonRulesPreset } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { standInPeople, standInSeedCast } from './stand-in-cast.ts';
import { dayIn } from './stand-in-world-clock.ts';
import { worldGamesStore } from './stand-in-world-games.ts';
import { madeUpLeagues, standInGameId, standInSeasonIds } from './stand-in-world-seed.ts';

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
        // The empty league's current season holds no round at all, on purpose (step 2.192;
        // its own test below says so); every other current season has one round today.
        if (league.leagueId === standInSeedCast.emptyLeague.id) continue;
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

describe('the empty league to start from (step 2.192)', () => {
  const now = new Date('2026-11-16T18:00:00Z');
  const leagues = madeUpLeagues(standInSeedCast, now);
  const counts = (slug: string) => {
    const l = leagues.find((league) => league.slug === slug);
    if (l === undefined) throw new Error(`no made-up league ${slug}`);
    return {
      seasons: l.seasons.length,
      current: l.currentSeasonId !== null,
      teams: l.teams.length,
      people: l.people.length,
      roster: l.roster.length,
      divisions: l.divisions.length,
      rounds: l.rounds.length,
      games: l.games.length,
      venues: l.venues.length,
      courts: l.courts.length,
      audience: l.audience,
    };
  };

  it('has one current season, with the default rules, and nothing else', () => {
    const empty = leagues.find((l) => l.leagueId === standInSeedCast.emptyLeague.id);
    expect(empty?.slug).toBe('still-waters');
    expect(counts('still-waters')).toEqual({
      seasons: 1,
      current: true,
      teams: 0,
      people: 0,
      roster: 0,
      divisions: 0,
      rounds: 0,
      games: 0,
      venues: 0,
      courts: 0,
      audience: 'adult',
    });
    const [season] = empty?.seasons ?? [];
    expect(season?.id).toBe(standInSeasonIds.empty);
    expect(empty?.currentSeasonId).toBe(standInSeasonIds.empty);
    expect(season?.rules).toEqual({ version: 1 });
    expect(season?.status).toBe('active');
    // Dated around the league's today: begun a week ago, ending in about three months.
    expect(season?.startsOn).toBe('2026-11-09');
    expect(season?.endsOn).toBe('2027-02-14');
    expect(empty?.lines ?? []).toEqual([]);
  });

  it("leaves every other made-up league's rows as they were", () => {
    const full = (seasons: number, current: boolean) => ({ seasons, current });
    expect(counts('north-valley')).toEqual({
      ...full(3, true),
      teams: 14,
      people: 43,
      roster: 42,
      divisions: 2,
      rounds: 8,
      games: 26,
      venues: 2,
      courts: 3,
      audience: 'adult',
    });
    expect(counts('harbor-city')).toEqual({
      ...full(1, true),
      teams: 3,
      people: 8,
      roster: 8,
      divisions: 0,
      rounds: 4,
      games: 5,
      venues: 1,
      courts: 1,
      audience: 'youth',
    });
    expect(counts('quiet-pines')).toEqual({
      ...full(1, true),
      teams: 4,
      people: 24,
      roster: 24,
      divisions: 0,
      rounds: 2,
      games: 7,
      venues: 1,
      courts: 2,
      audience: 'youth',
    });
    expect(counts('old-meadow')).toEqual({
      ...full(1, false),
      teams: 20,
      people: 0,
      roster: 0,
      divisions: 0,
      rounds: 30,
      games: 300,
      venues: 1,
      courts: 1,
      audience: 'youth',
    });
    for (const slug of ['closed-gate', 'binned-league', 'reed-marsh']) {
      expect(counts(slug), slug).toEqual({
        ...full(0, false),
        teams: 0,
        people: 0,
        roster: 0,
        divisions: 0,
        rounds: 0,
        games: 0,
        venues: 0,
        courts: 0,
        audience: 'youth',
      });
    }
    expect(leagues.map((l) => l.slug).sort()).toEqual(
      [
        'north-valley',
        'harbor-city',
        'quiet-pines',
        'old-meadow',
        'still-waters',
        'closed-gate',
        'binned-league',
        'reed-marsh',
      ].sort(),
    );
  });
});

describe('what the seeds saved before step 2.248 means the same after it (S-113)', () => {
  /** The clock of a stored rules document, or undefined when it holds none. */
  const clockOf = (
    rules: unknown,
  ): { mode?: unknown; stopClockLastSeconds?: unknown } | undefined => {
    if (typeof rules !== 'object' || rules === null || !('clock' in rules)) return undefined;
    const clock = (rules as { clock: unknown }).clock;
    return typeof clock === 'object' && clock !== null ? clock : undefined;
  };

  it('no seeded season, and no preset the demo league starts from, holds a stop clock with last minutes', () => {
    const stored = [
      ...madeUpLeagues(standInSeedCast, new Date('2026-11-16T18:00:00Z')).flatMap((l) =>
        l.seasons.map((s) => s.rules),
      ),
      ...SEASON_RULES_PRESETS.map((p) => seasonRulesPreset(p)),
    ];
    const clocks = stored.map(clockOf).filter((c) => c !== undefined);
    expect(clocks.length).toBeGreaterThan(SEASON_RULES_PRESETS.length);
    // The pair was refused until this step, so nothing saved can hold it: the loosened
    // check changes the reading of no saved season.
    expect(clocks.filter((c) => c.mode === 'stop' && c.stopClockLastSeconds != null)).toEqual([]);
    for (const rules of stored.filter((r) => clockOf(r) !== undefined)) {
      expect(SeasonRules.parse(rules)).toEqual(rules);
    }
  });
});
