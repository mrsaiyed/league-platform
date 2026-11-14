// Who may run the Al-Hadi transfer (step 2.58) in a league: whoever holds, for the whole
// league, every permission its commands ask for (adding people, putting them on a
// roster, scoring a game, reopening one), in a league that is not archived or
// suspended (U-9). Read fresh in the transaction (T-75). It is checked before the plan
// is worked out, so someone who may not run it is told so and is shown no plan; the
// commands still check each step themselves.
import type { CommandContext } from '../../command/index.ts';
import {
  accessOfAccount,
  allows,
  leagueScope,
  readOnlyLeagueStatuses,
  type Permission,
  type PermissionsTx,
} from '../access/index.ts';

/** The permissions the transfer's commands ask for, held for the whole league. */
export const trackerTransferPermissions: readonly Permission[] = [
  'people.manage',
  'rosters.manage',
  'games.score',
  'games.correct',
];

/** May the acting account run the transfer in the transaction's league? */
export async function mayTransferTrackerGames(
  context: CommandContext,
  tx: PermissionsTx,
): Promise<boolean> {
  if (context.accountId === null) return false;
  const holder = await accessOfAccount(tx, context.accountId);
  if (holder === undefined) return false;
  if (!trackerTransferPermissions.every((p) => allows(holder, p, leagueScope))) return false;
  const status = await tx.access.leagueStatus();
  return status !== undefined && !readOnlyLeagueStatuses.includes(status);
}
