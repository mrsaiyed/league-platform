// THE PUBLIC TEAMS PAGES' AND START PAGE'S LOCAL STAND-IN. FOR LOCAL WORK AND TESTS ONLY.
//
// The teams pages and the members' start page (step 2.44) on the one made-up world
// (stand-in-world.ts): a team's roster is the one Admin → Teams keeps, its lines made by
// core's one publicRosterLine (names through the one name function, T-81); the start page
// is the league's own setting, as League settings saves it; and a member's team is the one
// their person has a roster place on.
import type { PublicTeamsPorts } from './public-teams.ts';
import { worldPublicRoster, worldStartPage, worldTeamsOfAccount } from './stand-in-world-reads.ts';
import type { World } from './stand-in-world.ts';

export function standInPublicTeams(world: World): PublicTeamsPorts {
  return {
    startPageOf: async (leagueId) => worldStartPage(await world.read(leagueId)),
    rosterOf: async (leagueId, teamId, display) =>
      worldPublicRoster(await world.read(leagueId), teamId, display),
    teamIdsOfAccount: async (leagueId, seasonId, accountId) =>
      worldTeamsOfAccount(await world.read(leagueId), seasonId, accountId),
  };
}
