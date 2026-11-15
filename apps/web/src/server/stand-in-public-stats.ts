// THE PUBLIC STANDINGS AND STATISTICS PAGES' LOCAL STAND-IN. FOR LOCAL WORK AND TESTS ONLY.
//
// The standings and statistics pages (step 2.43) on the one made-up world
// (stand-in-world.ts): the same core queries run here as on the database, over the
// standings rows and player totals core itself worked out from the season's results, so
// a score typed in the games area or a tracked game that ends moves them.
import type { NamePolicyOf } from './name-policy-of.ts';
import type { PublicStatsPorts, PublicStatsSettings } from './public-stats.ts';
import { worldPublicSeasons } from './stand-in-world-reads.ts';
import { worldStandingsRead } from './stand-in-world-standings.ts';
import type { World } from './stand-in-world.ts';

export { adultTeams, standInSeasonIds, youthTeams } from './stand-in-world-seed.ts';

export function standInPublicStats(
  world: World,
  /** How each league shows names: its own privacy settings (T-81). */
  namePolicyOf: NamePolicyOf,
): PublicStatsPorts {
  return {
    seasonsOf: async (leagueId) => worldPublicSeasons(await world.read(leagueId)),
    settingsOf: async (leagueId): Promise<PublicStatsSettings> => {
      const s = await world.read(leagueId);
      return {
        // A league whose audience is not known counts as youth: the careful reading (R-15).
        audience: s?.audience ?? 'youth',
        namePolicy: await namePolicyOf(leagueId),
        minimumGames: s?.minimumGames ?? 0,
      };
    },
    readStoreOf: (leagueId) => worldStandingsRead(() => world.read(leagueId)),
  };
}
