// One invitation of the scope's league by its id, with its state; undefined if not there.
import type { Invitation } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { invitationColumns, invitationFromRow, invitationStatus } from './access-rows.ts';

export async function findInvitation(
  scope: LeagueScope,
  invitationId: string,
): Promise<Invitation | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('invitations')
    .select([...invitationColumns, invitationStatus()])
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', invitationId)
    .executeTakeFirst();
  return row === undefined ? undefined : invitationFromRow(row);
}
