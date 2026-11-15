// ADMIN → SCHEDULE'S LOCAL STAND-IN. FOR LOCAL WORK AND TESTS ONLY.
//
// The schedule grid (step 2.52) on the one made-up world (stand-in-world.ts): the
// scheduling module's own commands run on its rows, so a published schedule is the
// season's games everywhere: the public schedule and home page, a game's own page, the
// games area's list and the tracker. The draft is the same one a fixture import fills.
import type { ScheduleAdminPorts } from './schedule-admin.ts';
import type { World } from './stand-in-world.ts';

export function standInSchedule(world: World): ScheduleAdminPorts {
  return {
    deps: world.deps,
    teamsOf: async (leagueId, seasonId) =>
      ((await world.read(leagueId))?.teams ?? [])
        .filter((t) => t.seasonId === seasonId && !t.binned)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(({ id, name }) => ({ id, name })),
  };
}
