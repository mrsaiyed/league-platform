// Sets who plays in the league the scope is for (step 2.125), only if it is still at
// `version` (T-46; the database adds one to the version itself, 0002).
import type { Audience } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

/** The league's new version, or undefined if it moved on, is in the bin, or is out of sight. */
export async function updateLeagueAudience(
  scope: LeagueScope,
  audience: Audience,
  version: number,
): Promise<number | undefined> {
  const row = await transactionOf(scope)
    .updateTable('leagues')
    .set({ audience })
    .where('id', '=', scope.leagueId)
    .where('version', '=', version)
    .where('deleted_at', 'is', null)
    .returning('version')
    .executeTakeFirst();
  return row?.version;
}
