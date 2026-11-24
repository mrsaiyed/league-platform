import { describe, expect, it } from 'vitest';
import { standInSeedCast } from './stand-in-cast.ts';
import { leaveWithoutCurrentSeason } from './stand-in-world-no-current-season.ts';
import { madeUpLeagues } from './stand-in-world-seed.ts';

const made = () => madeUpLeagues(standInSeedCast, new Date('2026-11-16T18:00:00Z'));

describe('LOCAL_NO_CURRENT_SEASON (step 2.130)', () => {
  it('leaves the named league with no current season, its seasons kept, the others as they were', () => {
    const leagues = made();
    const league = leagues.find((l) => l.slug === 'harbor-city');
    if (league === undefined) throw new Error('no league');
    const seasons = league.seasons.length;
    const others = leagues.filter((l) => l !== league).map((l) => l.currentSeasonId);
    leaveWithoutCurrentSeason(leagues, 'harbor-city');
    expect(league.currentSeasonId).toBeNull();
    expect(league.seasons).toHaveLength(seasons);
    expect(leagues.filter((l) => l !== league).map((l) => l.currentSeasonId)).toEqual(others);
  });

  it('stops the app for a league that is not there or has no current season', () => {
    expect(() => leaveWithoutCurrentSeason(made(), 'no-such-league')).toThrow(
      /LOCAL_NO_CURRENT_SEASON/,
    );
    expect(() => leaveWithoutCurrentSeason(made(), 'old-meadow')).toThrow(
      /LOCAL_NO_CURRENT_SEASON/,
    );
  });
});
