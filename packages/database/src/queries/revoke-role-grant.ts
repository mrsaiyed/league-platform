// Ends a grant in force in the scope's league, now, naming who ended it. The row
// stays (T3 §5). False if it is not there or was already ended.
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function revokeRoleGrant(
  scope: LeagueScope,
  grantId: string,
  byAccountId: string,
): Promise<boolean> {
  const row = await transactionOf(scope)
    .updateTable('role_grants')
    .set({ revoked_at: sql<Date>`now()`, revoked_by_account_id: byAccountId })
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', grantId)
    .where('revoked_at', 'is', null)
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}
