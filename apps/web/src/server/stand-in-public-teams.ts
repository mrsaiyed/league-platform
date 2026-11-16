// THE PUBLIC TEAMS PAGES' AND START PAGE'S LOCAL STAND-IN. FOR LOCAL WORK AND TESTS ONLY.
//
// The members' start page (step 2.44) on the one made-up world (stand-in-world.ts): the
// start page is the league's own setting, as League settings saves it, and a member's team
// is the one their person has a roster place on. A team's roster is read with the
// statistics (stand-in-public-stats.ts, statisticsOf, record 070).
import type { PublicTeamsPorts } from './public-teams.ts';
import { worldStartPage, worldTeamsOfAccount } from './stand-in-world-reads.ts';
import type { World } from './stand-in-world.ts';

export function standInPublicTeams(world: World): PublicTeamsPorts {
  return {
    startPageOf: async (leagueId) => worldStartPage(await world.read(leagueId)),
    teamIdsOfAccount: async (leagueId, seasonId, accountId) =>
      worldTeamsOfAccount(await world.read(leagueId), seasonId, accountId),
  };
}
