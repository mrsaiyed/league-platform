// Marks a pending, unexpired invitation of the scope's league accepted by the
// account, by the database's clock, only while its link is still `tokenHash`. False
// if it is not there, no longer pending, or was re-sent: two people using one link
// at once cannot both get in, and a link re-sent a moment ago no longer works. The
// update locks the row, so a concurrent accept or re-send waits and then finds the
// conditions no longer hold.
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function markInvitationAccepted(
  scope: LeagueScope,
  invitationId: string,
  tokenHash: string,
  accountId: string,
): Promise<boolean> {
  const row = await transactionOf(scope)
    .updateTable('invitations')
    .set({ accepted_at: sql<Date>`now()`, accepted_by_account_id: accountId })
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', invitationId)
    .where('token_hash', '=', tokenHash)
    .where('accepted_at', 'is', null)
    .where('cancelled_at', 'is', null)
    .where(sql<boolean>`expires_at > now()`)
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}
