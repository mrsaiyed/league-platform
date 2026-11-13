// Marks a pending, unexpired invitation of the scope's league accepted by the
// account, by the database's clock. False if it is not there or no longer pending,
// so two people using one link at once cannot both get in.
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function markInvitationAccepted(
  scope: LeagueScope,
  invitationId: string,
  accountId: string,
): Promise<boolean> {
  const row = await transactionOf(scope)
    .updateTable('invitations')
    .set({ accepted_at: sql<Date>`now()`, accepted_by_account_id: accountId })
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', invitationId)
    .where('accepted_at', 'is', null)
    .where('cancelled_at', 'is', null)
    .where(sql<boolean>`expires_at > now()`)
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}
