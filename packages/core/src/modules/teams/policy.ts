// Who may run the teams commands (T-74), read from the database on every call (T-75).
import type { CommandContext } from '../../command/index.ts';
import { hasPermission, leagueScope, readOnlyLeagueStatuses, type Scope } from '../access/index.ts';
import type { TeamsTx } from './ports.ts';

/**
 * Changing teams (P4 §3 `teams.manage`: the owner and admins today): at the team's
 * season's program, so an admin limited to one program manages that program's teams
 * (P4 §4); not while the league is archived or suspended (U-9). A season or team that
 * is not there is checked league-wide, so only those who may manage any program's
 * teams learn it is missing.
 */
export async function mayChangeTeams(
  context: CommandContext,
  tx: TeamsTx,
  scope: Scope,
): Promise<boolean> {
  if (!(await hasPermission(context, tx, 'teams.manage', scope))) return false;
  const status = await tx.access.leagueStatus();
  return status !== undefined && !readOnlyLeagueStatuses.includes(status);
}

export async function seasonScope(tx: TeamsTx, seasonId: string): Promise<Scope> {
  const programId = await tx.teams.seasonProgramId(seasonId);
  return programId === undefined ? leagueScope : { type: 'program', id: programId };
}

export async function teamScope(tx: TeamsTx, teamId: string): Promise<Scope> {
  const team = await tx.teams.find(teamId);
  return team === undefined ? leagueScope : seasonScope(tx, team.seasonId);
}
