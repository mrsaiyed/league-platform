// Who may run each leagues command (T-74), read from the database on every call (T-75).
import type { CommandContext } from '../../command/index.ts';
import { hasPermission, leagueScope, type Permission, type Scope } from '../access/index.ts';
import { isReadOnlyStatus } from './league-states.ts';
import type { LeaguesTx } from './ports.ts';

/**
 * Changing the league's own settings: the `league.settings` permission, which the
 * owner and admins hold (P4 §4, O-7). Its seasons ask for `season.settings`, which
 * the same people hold today (P4 §3), checked at the season's program so an admin
 * limited to one program manages that program's seasons (P4 §4).
 */
export async function mayChangeLeagueSettings(
  context: CommandContext,
  tx: LeaguesTx,
  permission: Permission = 'league.settings',
  scope: Scope = leagueScope,
): Promise<boolean> {
  const league = await tx.leagues.currentLeague();
  if (league === undefined || league.id !== context.leagueId) return false;
  return hasPermission(context, tx, permission, scope);
}

/**
 * Our own staff only (creating leagues, suspending them). Staff are not a league
 * role (A-3 lists none, and T-77 gives staff no standing access to any league):
 * the app names them from its settings; nobody is staff by default.
 */
export async function mayActAsPlatform(context: CommandContext, tx: LeaguesTx): Promise<boolean> {
  return context.accountId !== null && (await tx.leagues.isPlatformStaff());
}

/**
 * Changing a league's settings or seasons (U-9): as `mayChangeLeagueSettings`, but
 * not while the league is archived or suspended, which are read-only. Changing the
 * state itself uses `mayChangeLeagueSettings`, so an archived league can still be
 * brought back.
 */
export async function mayEditLeague(
  context: CommandContext,
  tx: LeaguesTx,
  permission: Permission = 'league.settings',
  scope: Scope = leagueScope,
): Promise<boolean> {
  if (!(await mayChangeLeagueSettings(context, tx, permission, scope))) return false;
  const league = await tx.leagues.currentLeague();
  return league !== undefined && !isReadOnlyStatus(league.status);
}

/** Where a program's things are checked: that program (P4 §4). */
export function programScope(programId: string): Scope {
  return { type: 'program', id: programId };
}

/**
 * Where a season's divisions are checked: at the season's program, so an admin
 * limited to one program manages that program's divisions (P4 §4). A season that
 * is not there is checked league-wide, so only those who may manage any program's
 * learn it is missing.
 */
export async function seasonScope(tx: LeaguesTx, seasonId: string): Promise<Scope> {
  const programId = await tx.leagues.seasonProgramId(seasonId);
  return programId === undefined ? leagueScope : programScope(programId);
}

/** Where a division's things are checked: at its season's program. */
export async function divisionScope(tx: LeaguesTx, divisionId: string): Promise<Scope> {
  const division = await tx.divisions.find(divisionId);
  return division === undefined ? leagueScope : seasonScope(tx, division.seasonId);
}
