// Who may run each leagues command (T-74), read from the database on every call (T-75).
import type { CommandContext } from '../../command/index.ts';
import { hasPermission } from '../access/index.ts';
import { isReadOnlyStatus } from './league-states.ts';
import type { LeaguesTx } from './ports.ts';

/**
 * Changing the league's own settings: the `league.settings` permission, which the
 * owner and admins hold (P4 §4, O-7).
 */
export async function mayChangeLeagueSettings(
  context: CommandContext,
  tx: LeaguesTx,
): Promise<boolean> {
  const league = await tx.leagues.currentLeague();
  if (league === undefined || league.id !== context.leagueId) return false;
  return hasPermission(context, tx, 'league.settings');
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
export async function mayEditLeague(context: CommandContext, tx: LeaguesTx): Promise<boolean> {
  if (!(await mayChangeLeagueSettings(context, tx))) return false;
  const league = await tx.leagues.currentLeague();
  return league !== undefined && !isReadOnlyStatus(league.status);
}
