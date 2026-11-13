// One grant of the scope's league, in force or ended; undefined if it is not there.
import type { Grant } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { grantColumns, grantFromRow } from './access-rows.ts';

export async function findRoleGrant(
  scope: LeagueScope,
  grantId: string,
): Promise<Grant | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('role_grants')
    .select(grantColumns)
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', grantId)
    .executeTakeFirst();
  return row === undefined ? undefined : grantFromRow(row);
}
