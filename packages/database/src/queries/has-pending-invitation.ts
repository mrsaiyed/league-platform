// Whether the scope's league has an open, unexpired invitation for this email (any
// capitals), role and scope.
import type { Role, Scope } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { scopeColumns } from './access-rows.ts';

export async function hasPendingInvitation(
  scope: LeagueScope,
  email: string,
  role: Role,
  where: Scope,
): Promise<boolean> {
  const columns = scopeColumns(where);
  const row = await transactionOf(scope)
    .selectFrom('invitations')
    .select('id')
    .where('league_id', '=', scope.leagueId)
    .where(sql<boolean>`lower(email) = ${email.toLowerCase()}`)
    .where('role', '=', role)
    .where('scope_type', '=', columns.scope_type)
    .where(sql<boolean>`scope_id is not distinct from ${columns.scope_id}::uuid`)
    .where('accepted_at', 'is', null)
    .where('cancelled_at', 'is', null)
    .where(sql<boolean>`expires_at > now()`)
    .executeTakeFirst();
  return row !== undefined;
}
