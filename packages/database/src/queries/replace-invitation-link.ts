// Gives a pending invitation of the scope's league a new link (token hash), as its
// email is sent (T-226). The link before stops working; the expiry stays. Undefined
// if it is not there, or accepted, cancelled or expired, by the database's clock.
import type { Invitation } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { invitationColumns, invitationFromRow, invitationStatus } from './access-rows.ts';

export async function replaceInvitationLink(
  scope: LeagueScope,
  invitationId: string,
  tokenHash: string,
): Promise<Invitation | undefined> {
  const row = await transactionOf(scope)
    .updateTable('invitations')
    .set({ token_hash: tokenHash })
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', invitationId)
    .where('accepted_at', 'is', null)
    .where('cancelled_at', 'is', null)
    .where('expires_at', '>', sql<Date>`now()`)
    .returning([...invitationColumns, invitationStatus()])
    .executeTakeFirst();
  return row === undefined ? undefined : invitationFromRow(row);
}
