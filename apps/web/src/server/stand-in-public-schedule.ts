// THE PUBLIC HOME AND SCHEDULE PAGES' LOCAL STAND-IN. FOR LOCAL WORK AND TESTS ONLY.
//
// The home and schedule pages (step 2.42) and a game's place on them, on the one made-up
// world (stand-in-world.ts), in the same shapes the database query (step 2.39) returns:
// the published games of a season by round, as of the league's own today in its own time
// zone. A schedule published in Admin → Schedule, a score typed in the games area and a
// postponement all show here, and every card opens the same game's page.
import type { PublicSchedulePorts } from './public-schedule.ts';
import { worldGameFacts, worldLeagueClock, worldPublicSchedule } from './stand-in-world-reads.ts';
import type { World } from './stand-in-world.ts';

export function standInPublicSchedule(world: World): PublicSchedulePorts {
  return {
    clockOf: async (leagueId) => worldLeagueClock(await world.read(leagueId), world.now()),
    scheduleOf: async (leagueId, seasonId, today) =>
      worldPublicSchedule(await world.read(leagueId), seasonId, today),
    gameFactsOf: async (leagueId, seasonId, gameId) =>
      worldGameFacts(await world.read(leagueId), seasonId, gameId),
  };
}
