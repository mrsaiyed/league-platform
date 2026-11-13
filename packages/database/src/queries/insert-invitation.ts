// Adds an invitation to the scope's league. Its link expires `lifetimeDays` from the
// database's now; only the hash of the link's token is stored (0004).
import type { Invitation, NewInvitation } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import {
  invitationColumns,
  invitationFromRow,
  invitationStatus,
  scopeColumns,
} from './access-rows.ts';

export async function insertInvitation(
  scope: LeagueScope,
  invitation: NewInvitation,
): Promise<Invitation> {
  const row = await transactionOf(scope)
    .insertInto('invitations')
    .values({
      league_id: scope.leagueId,
      email: invitation.email,
      role: invitation.role,
      ...scopeColumns(invitation.scope),
      token_hash: invitation.tokenHash,
      invited_by_account_id: invitation.invitedByAccountId,
      expires_at: sql<Date>`now() + make_interval(days => ${invitation.lifetimeDays})`,
    })
    .returning([...invitationColumns, invitationStatus()])
    .executeTakeFirstOrThrow();
  return invitationFromRow(row);
}
