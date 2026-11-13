// Gives an account a role in the scope's league: the new grant, or 'already-held'
// when the account has that role there already, even one given a moment ago by a
// concurrent request (role_grants_one_active; nothing is thrown, so the transaction
// stays usable).
import type { Grant, NewGrant } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { grantColumns, grantFromRow, scopeColumns } from './access-rows.ts';

export async function insertRoleGrant(
  scope: LeagueScope,
  grant: NewGrant,
): Promise<Grant | 'already-held'> {
  const row = await transactionOf(scope)
    .insertInto('role_grants')
    .values({
      league_id: scope.leagueId,
      account_id: grant.accountId,
      role: grant.role,
      ...scopeColumns(grant.scope),
      granted_by_account_id: grant.grantedByAccountId,
    })
    .onConflict((conflict) =>
      conflict
        .columns(['league_id', 'account_id', 'role', 'scope_type', 'scope_id'])
        .where('revoked_at', 'is', null)
        .doNothing(),
    )
    .returning(grantColumns)
    .executeTakeFirst();
  return row === undefined ? 'already-held' : grantFromRow(row);
}
