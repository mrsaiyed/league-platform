// Sets the state of the scope's league, only if it is still at `version` (T-46).
// Which changes are allowed is the leagues module's rule (U-9), not checked here.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

/** The league's new version, or undefined if it moved on, is in the bin, or is out of sight. */
export async function updateLeagueStatus(
  scope: LeagueScope,
  status: string,
  version: number,
): Promise<number | undefined> {
  const row = await transactionOf(scope)
    .updateTable('leagues')
    .set({ status })
    .where('id', '=', scope.leagueId)
    .where('version', '=', version)
    .where('deleted_at', 'is', null)
    .returning('version')
    .executeTakeFirst();
  return row?.version;
}
