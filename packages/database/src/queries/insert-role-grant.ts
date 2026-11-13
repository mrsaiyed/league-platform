// Gives an account a role in the scope's league. The caller checks first that the
// account has no such grant in force (role_grants_one_active would refuse it).
import type { Grant, NewGrant } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { grantColumns, grantFromRow, scopeColumns } from './access-rows.ts';

export async function insertRoleGrant(scope: LeagueScope, grant: NewGrant): Promise<Grant> {
  const row = await transactionOf(scope)
    .insertInto('role_grants')
    .values({
      league_id: scope.leagueId,
      account_id: grant.accountId,
      role: grant.role,
      ...scopeColumns(grant.scope),
      granted_by_account_id: grant.grantedByAccountId,
    })
    .returning(grantColumns)
    .executeTakeFirstOrThrow();
  return grantFromRow(row);
}
