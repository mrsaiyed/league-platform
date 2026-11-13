// Gives an invitation of the scope's league that is neither accepted nor cancelled a
// new link (token hash) and a new expiry from the database's now. The old link
// stops working. Undefined if it is not there, or accepted or cancelled.
import type { Invitation } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { invitationColumns, invitationFromRow, invitationStatus } from './access-rows.ts';

export async function renewInvitationLink(
  scope: LeagueScope,
  invitationId: string,
  tokenHash: string,
  lifetimeDays: number,
): Promise<Invitation | undefined> {
  const row = await transactionOf(scope)
    .updateTable('invitations')
    .set({
      token_hash: tokenHash,
      expires_at: sql<Date>`now() + make_interval(days => ${lifetimeDays})`,
    })
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', invitationId)
    .where('accepted_at', 'is', null)
    .where('cancelled_at', 'is', null)
    .returning([...invitationColumns, invitationStatus()])
    .executeTakeFirst();
  return row === undefined ? undefined : invitationFromRow(row);
}
