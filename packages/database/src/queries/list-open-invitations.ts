// The scope's league's invitations that are neither accepted nor cancelled (pending
// or expired), oldest first: the Admins page (P4 §6).
import type { Invitation } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { invitationColumns, invitationFromRow, invitationStatus } from './access-rows.ts';

export async function listOpenInvitations(scope: LeagueScope): Promise<Invitation[]> {
  const rows = await transactionOf(scope)
    .selectFrom('invitations')
    .select([...invitationColumns, invitationStatus()])
    .where('league_id', '=', scope.leagueId)
    .where('accepted_at', 'is', null)
    .where('cancelled_at', 'is', null)
    .orderBy('id')
    .execute();
  return rows.map(invitationFromRow);
}
