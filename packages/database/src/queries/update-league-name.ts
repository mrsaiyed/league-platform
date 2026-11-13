// Sets the name of the league the scope is for, only if it is still at `version`
// (T-46; the database adds one to the version itself, 0002).
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

/** The league's new version, or undefined if it moved on, is in the bin, or is out of sight. */
export async function updateLeagueName(
  scope: LeagueScope,
  name: string,
  version: number,
): Promise<number | undefined> {
  const row = await transactionOf(scope)
    .updateTable('leagues')
    .set({ name })
    .where('id', '=', scope.leagueId)
    .where('version', '=', version)
    .where('deleted_at', 'is', null)
    .returning('version')
    .executeTakeFirst();
  return row?.version;
}
