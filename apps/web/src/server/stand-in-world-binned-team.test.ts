import { describe, expect, it } from 'vitest';
import { standInSeedCast } from './stand-in-cast.ts';
import { binTeamOfFirstLeague } from './stand-in-world-binned-team.ts';
import { madeUpLeagues } from './stand-in-world-seed.ts';

describe('LOCAL_BINNED_TEAM (step 2.180)', () => {
  it("puts the named team of the first league's current season in the bin, its games kept", () => {
    const leagues = madeUpLeagues(standInSeedCast, new Date('2026-11-16T18:00:00Z'));
    const first = leagues[0];
    if (first === undefined) throw new Error('no league');
    const games = first.games.length;
    binTeamOfFirstLeague(leagues, 'badgers');
    const binned = first.teams.filter((t) => t.binned);
    expect(binned.map((t) => [t.name, t.seasonId])).toEqual([['Badgers', first.currentSeasonId]]);
    expect(first.games).toHaveLength(games);
  });

  it('stops the app for a team the season has not', () => {
    const leagues = madeUpLeagues(standInSeedCast, new Date('2026-11-16T18:00:00Z'));
    expect(() => binTeamOfFirstLeague(leagues, 'no-such-team')).toThrow(/LOCAL_BINNED_TEAM/);
  });
});
