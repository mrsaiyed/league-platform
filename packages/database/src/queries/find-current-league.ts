// The league the scope is for, unless it is in the bin. What the leagues module's
// policy and commands read before changing it.
import type { LeagueStatus } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { leagueStatusOf } from './league-status-of.ts';

export type CurrentLeague = {
  id: string;
  name: string;
  slug: string;
  status: LeagueStatus;
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
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: leagueStatusOf(row.status),
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
