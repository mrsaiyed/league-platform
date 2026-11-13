// Cancels an invitation of the scope's league that is neither accepted nor
// cancelled. False if it is not there, or was.
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function markInvitationCancelled(
  scope: LeagueScope,
  invitationId: string,
): Promise<boolean> {
  const row = await transactionOf(scope)
    .updateTable('invitations')
    .set({ cancelled_at: sql<Date>`now()` })
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', invitationId)
    .where('accepted_at', 'is', null)
    .where('cancelled_at', 'is', null)
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}
