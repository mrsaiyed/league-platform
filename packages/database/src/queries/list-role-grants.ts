// Every grant in force in the scope's league, oldest first: the Admins page (P4 §6).
import type { Grant } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { grantColumns, grantFromRow } from './access-rows.ts';

export async function listRoleGrants(scope: LeagueScope): Promise<Grant[]> {
  const rows = await transactionOf(scope)
    .selectFrom('role_grants')
    .select(grantColumns)
    .where('league_id', '=', scope.leagueId)
    .where('revoked_at', 'is', null)
    .orderBy('id')
    .execute();
  return rows.map(grantFromRow);
}
