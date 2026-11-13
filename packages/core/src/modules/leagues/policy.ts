// Who may run each leagues command (T-74), read from the database on every call (T-75).
import type { CommandContext } from '../../command/index.ts';
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
