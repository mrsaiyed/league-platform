// Whether the scope's league has an open, unexpired invitation for this email (any
// capitals), role and scope. It first takes a lock on that question for the rest of
// the transaction, so a second invite of the same person, role and place waits for
// the first to commit and then sees it: the check and the insert after it are one
// step. (A unique index would say it in the table itself; that needs a migration,
// record 014.)
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
  const trx = transactionOf(scope);
  const key = ['invitation', scope.leagueId, email.toLowerCase(), role, columns.scope_type];
  await sql`select pg_advisory_xact_lock(hashtextextended(${[...key, columns.scope_id ?? ''].join(':')}, 0))`.execute(
    trx,
  );
  const row = await trx
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
