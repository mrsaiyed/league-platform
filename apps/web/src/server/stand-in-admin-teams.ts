// THE ADMIN TEAMS SCREENS' LOCAL STAND-IN. FOR LOCAL WORK AND TESTS ONLY.
//
// The Teams screens (step 2.51) on the one made-up world (stand-in-world.ts): the real
// teams and people commands run on its rows, so a team added here, and the players put on
// it, are the season's team on the public teams pages, in the schedule grid, the fixture
// import and the tracker. Every rule (who may change what, a number worn twice, a person
// still on a roster) is the product's own: only the storage is made up.
//
// Gone when the database-backed list of a season's teams is wired to the web app.
import type { AdminTeamsPorts } from './admin-teams.ts';
import type { World } from './stand-in-world.ts';

export function standInAdminTeams(world: World): AdminTeamsPorts {
  return {
    deps: world.deps,
    // The season the screens work on: the league's current one.
    currentSeason: async (leagueId) => {
      const s = await world.read(leagueId);
      const season = s?.seasons.find((x) => x.id === s.currentSeasonId);
      return season === undefined ? undefined : { id: season.id, name: season.name };
    },
    divisions: async (leagueId, seasonId) =>
      ((await world.read(leagueId))?.divisions ?? [])
        .filter((d) => d.seasonId === seasonId && !d.binned)
        .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
        .map(({ id, name }) => ({ id, name })),
    teams: async (leagueId, seasonId) =>
      ((await world.read(leagueId))?.teams ?? [])
        .filter((t) => t.seasonId === seasonId && !t.binned)
        .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
