// Which teams of the league's current season hold each person on their roster now (no
// leaving date), read as Admin → Teams reads them (step 2.50): the list writes them
// beside each name so two people of the same name can be told apart, the record names
// them in its Teams part, and adding someone whose name is taken says where the other is.
// A league has few teams, so every roster is read once. A team whose roster this role may
// not read is left out; the people commands still check for themselves.
import { listRoster, type CommandContext, type TeamRecord } from '@srleagues/core';
import { webPorts } from '../../server/container.ts';

export type TeamsByPerson = ReadonlyMap<string, readonly TeamRecord[]>;

export async function currentTeamsByPerson(context: CommandContext): Promise<TeamsByPerson> {
  const ports = (await webPorts()).adminTeams;
  const season = await ports.currentSeason(context);
  const held = new Map<string, TeamRecord[]>();
  if (season === undefined) return held;
  const teams = await ports.teams(context, season.id);
  const rosters = await Promise.all(
    teams.map((team) => listRoster(context, { teamId: team.id }, ports.deps)),
  );
  teams.forEach((team, at) => {
    const roster = rosters[at];
    if (roster === undefined || !roster.ok) return;
    for (const line of roster.value) {
      if (line.leftOn !== null) continue;
      const mine = held.get(line.personId) ?? [];
      if (!mine.some((t) => t.id === team.id)) held.set(line.personId, [...mine, team]);
    }
  });
  return held;
}
