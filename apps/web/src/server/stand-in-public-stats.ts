// THE PUBLIC STANDINGS AND STATISTICS PAGES' LOCAL STAND-IN. FOR LOCAL WORK AND TESTS ONLY.
//
// The standings and statistics pages (step 2.43) on the one made-up world
// (stand-in-world.ts): the same core queries run here as on the database, over the
// standings rows and player totals core itself worked out from the season's results, so
// a score typed in the games area or a tracked game that ends moves them. A team's roster
// (step 2.44) is the one Admin → Teams keeps, its lines made by core's one
// publicRosterLine (names through the one name function, T-81).
import { readStandings } from '@srleagues/core';
import type { NamePolicyOf } from './name-policy-of.ts';
import type { PublicStatsPorts, PublicStatsSettings } from './public-stats.ts';
import {
  worldMinimumGames,
  worldPublicRoster,
  worldPublicSeasons,
} from './stand-in-world-reads.ts';
import { worldStandingsRead } from './stand-in-world-standings.ts';
import type { World } from './stand-in-world.ts';

export { adultTeams, standInSeasonIds, youthTeams } from './stand-in-world-seed.ts';

export function standInPublicStats(
  world: World,
  /** How each league shows names: its own privacy settings (T-81). */
  namePolicyOf: NamePolicyOf,
): PublicStatsPorts {
  const settingsOf = async (leagueId: string): Promise<PublicStatsSettings> => {
    const s = await world.read(leagueId);
    return {
      // A league whose audience is not known counts as youth: the careful reading (R-15).
      audience: s?.audience ?? 'youth',
      namePolicy: await namePolicyOf(leagueId),
      // The league's own rule, as League settings saves it (P7 §6; 3 to start).
      minimumGames: worldMinimumGames(s),
    };
  };
  return {
    seasonsOf: async (leagueId) => worldPublicSeasons(await world.read(leagueId)),
    settingsOf,
    readStoreOf: (leagueId) => worldStandingsRead(() => world.read(leagueId)),
    // The world runs one transaction at a time: its reads and its settings agree already.
    // A roster's names follow the same settings the statistics are shown by.
    statisticsOf: async (leagueId, work) => {
      const settings = await settingsOf(leagueId);
      return work({
        store: worldStandingsRead(() => world.read(leagueId)),
        settings,
        rosterOf: async (teamId, viewer) =>
          worldPublicRoster(await world.read(leagueId), teamId, {
            viewer,
            policy: settings.namePolicy,
          }),
      });
    },
    standingsOf: (leagueId, seasonId) =>
      readStandings(
        worldStandingsRead(() => world.read(leagueId)),
        { seasonId },
      ),
  };
}
