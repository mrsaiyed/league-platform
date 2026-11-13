// The invitation of the scope's league whose link has this token hash, with its
// state. A token from another league's link is not found here (T-226).
import type { Invitation } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { invitationColumns, invitationFromRow, invitationStatus } from './access-rows.ts';

export async function findInvitationByTokenHash(
  scope: LeagueScope,
  tokenHash: string,
): Promise<Invitation | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('invitations')
    .select([...invitationColumns, invitationStatus()])
    .where('league_id', '=', scope.leagueId)
    .where('token_hash', '=', tokenHash)
    .executeTakeFirst();
  return row === undefined ? undefined : invitationFromRow(row);
}
