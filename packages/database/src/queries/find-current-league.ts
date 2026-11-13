// The league the scope is for, unless it is in the bin. What the leagues module's
// policy and commands read before changing it.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export type CurrentLeague = {
  id: string;
  name: string;
  slug: string;
  status: 'draft' | 'live' | 'archived' | 'suspended';
  ownerAccountId: string;
  version: number;
};

export const leagueColumns = [
  'id',
  'name',
  'slug',
  'status',
  'owner_account_id',
  'version',
] as const;

type LeagueRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  owner_account_id: string;
  version: number;
};

/** The league row as the module sees it, field by field (T-29). */
export function currentLeague(row: LeagueRow): CurrentLeague {
  const status = row.status;
  if (status !== 'draft' && status !== 'live' && status !== 'archived' && status !== 'suspended') {
    throw new Error('A league has a state the leagues table does not allow.');
  }
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status,
    ownerAccountId: row.owner_account_id,
    version: row.version,
  };
}

export async function findCurrentLeague(scope: LeagueScope): Promise<CurrentLeague | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('leagues')
    .select(leagueColumns)
    .where('id', '=', scope.leagueId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return row === undefined ? undefined : currentLeague(row);
}
