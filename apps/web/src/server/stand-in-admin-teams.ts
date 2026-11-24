// THE ADMIN TEAMS SCREENS' LOCAL STAND-IN. FOR LOCAL WORK AND TESTS ONLY.
//
// The Teams screens (step 2.51) on the one made-up world (stand-in-world.ts): the real
// teams and people commands run on its rows, so a team added here, and the players put on
// it, are the season's team on the public teams pages, in the schedule grid, the fixture
// import and the tracker. Every rule (who may change what, a number worn twice, a person
// still on a roster) is the product's own: only the storage is made up. The three reads
// answer only someone who may manage the season's teams, as the database's do.
//
// The database's are database-admin-teams.ts (step 2.93 part 5); this one stays for the
// made-up world.
import type { AccessHolder, CommandContext } from '@srleagues/core';
import { mayListSeasonTeams, type AdminTeamsPorts } from './admin-teams.ts';
import type { World } from './stand-in-world.ts';

export function standInAdminTeams(
  world: World,
  /** What an account holds in a league, read fresh (the web ports' own accessOf). */
  accessOf: (context: CommandContext) => Promise<AccessHolder | undefined>,
): AdminTeamsPorts {
  /** The league's world and its seasons this person may manage the teams of. */
  const seasonsOf = async (context: CommandContext) => {
    const s = await world.read(context.leagueId);
    const holder = await accessOf(context);
    const seasons = (s?.seasons ?? []).filter((x) => mayListSeasonTeams(holder, x.programId));
    return { s, seasons };
  };
  const mayList = async (context: CommandContext, seasonId: string) =>
    (await seasonsOf(context)).seasons.some((x) => x.id === seasonId.toLowerCase());
  return {
    deps: world.deps,
    // The season the screens work on: the league's current one.
    currentSeason: async (context) => {
      const { s, seasons } = await seasonsOf(context);
      const season = seasons.find((x) => x.id === s?.currentSeasonId);
      return season === undefined
        ? undefined
        : { id: season.id, name: season.name, archived: season.status === 'completed' };
    },
    divisions: async (context, seasonId) =>
      (await mayList(context, seasonId))
        ? ((await world.read(context.leagueId))?.divisions ?? [])
            .filter((d) => d.seasonId === seasonId && !d.binned)
            .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
            .map(({ id, name }) => ({ id, name }))
        : [],
    teams: async (context, seasonId) =>
      (await mayList(context, seasonId))
        ? ((await world.read(context.leagueId))?.teams ?? [])
            .filter((t) => t.seasonId === seasonId && !t.binned)
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
  };
}
