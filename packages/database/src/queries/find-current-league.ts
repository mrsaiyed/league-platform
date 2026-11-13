// The league the scope is for, unless it is in the bin. What the leagues module's
// policy and commands read before changing it.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export type CurrentLeague = { id: string; name: string; ownerAccountId: string; version: number };

export async function findCurrentLeague(scope: LeagueScope): Promise<CurrentLeague | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('leagues')
    .select(['id', 'name', 'owner_account_id', 'version'])
    .where('id', '=', scope.leagueId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return row === undefined
    ? undefined
    : { id: row.id, name: row.name, ownerAccountId: row.owner_account_id, version: row.version };
}
