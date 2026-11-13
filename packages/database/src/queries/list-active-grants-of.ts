// One account's grants in force in the scope's league: what every permission check
// reads, fresh in each command's transaction, so a removed grant is gone at once (T-75).
import type { Grant } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { grantColumns, grantFromRow } from './access-rows.ts';

export async function listActiveGrantsOf(scope: LeagueScope, accountId: string): Promise<Grant[]> {
  const rows = await transactionOf(scope)
    .selectFrom('role_grants')
    .select(grantColumns)
    .where('league_id', '=', scope.leagueId)
    .where('account_id', '=', accountId)
    .where('revoked_at', 'is', null)
    .orderBy('id')
    .execute();
  return rows.map(grantFromRow);
}
