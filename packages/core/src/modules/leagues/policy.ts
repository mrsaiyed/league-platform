// Who may run each leagues command (T-74), read from the database on every call (T-75).
import type { CommandContext } from '../../command/index.ts';
import { isReadOnlyStatus } from './league-states.ts';
import type { LeaguesTx } from './ports.ts';

/**
 * Changing the league's own settings. Until roles and permissions exist (step 1.12)
 * only the league's owner may; 1.12 replaces this with the named permission.
 */
export async function mayChangeLeagueSettings(
  context: CommandContext,
  tx: LeaguesTx,
): Promise<boolean> {
  if (context.accountId === null) return false;
  const league = await tx.leagues.currentLeague();
  return (
    league !== undefined &&
    league.id === context.leagueId &&
    league.ownerAccountId === context.accountId
  );
}

/**
 * Our own staff only (creating leagues, suspending them). Staff are named by the app
 * from its settings until roles exist (step 1.12); nobody is staff by default.
 */
export async function mayActAsPlatform(context: CommandContext, tx: LeaguesTx): Promise<boolean> {
  return context.accountId !== null && (await tx.leagues.isPlatformStaff());
}

/**
 * Changing a league's settings or seasons (U-9): the owner may, but not while the
 * league is archived or suspended, which are read-only. Changing the state itself
 * uses `mayChangeLeagueSettings`, so an archived league can still be brought back.
 */
export async function mayEditLeague(context: CommandContext, tx: LeaguesTx): Promise<boolean> {
  if (!(await mayChangeLeagueSettings(context, tx))) return false;
  const league = await tx.leagues.currentLeague();
  return league !== undefined && !isReadOnlyStatus(league.status);
}
