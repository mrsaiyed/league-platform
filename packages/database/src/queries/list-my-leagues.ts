// The leagues of the account the transaction was opened for (record 066, T-269): the
// product's one read across leagues for an ordinary signed-in person. It goes through
// the narrow function public.my_leagues (0018), which takes no account of its own and
// answers only for current_account_id(), so the scope's account is the only one it can
// ever be about; with no account set it answers nothing. The rows are before U-9's rule
// of what the person may see: core's myLeagues applies it.
import { roles, type AccountLeagueRow, type Role } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type AppScope } from '../db/transaction-scope.ts';
import { leagueStatusOf } from './league-status-of.ts';

type Row = {
  league_id: string;
  slug: string;
  name: string;
  status: string;
  is_owner: boolean;
  roles: string[];
  league_wide_roles: string[];
  on_roster: boolean;
};

function rolesOf(values: readonly string[]): Role[] {
  return values.map((value) => {
    const role = roles.find((r) => r === value);
    if (role === undefined) throw new Error('A grant has a role the access module does not know.');
    return role;
  });
}

export async function listMyLeagues(scope: AppScope): Promise<AccountLeagueRow[]> {
  if (scope.accountId === null) return [];
  const { rows } = await sql<Row>`
    select league_id, slug, name, status, is_owner, roles, league_wide_roles, on_roster
    from public.my_leagues()
  `.execute(transactionOf(scope));
  return rows.map((row) => ({
    leagueId: row.league_id,
    slug: row.slug,
    name: row.name,
    status: leagueStatusOf(row.status),
    isOwner: row.is_owner,
    roles: rolesOf(row.roles),
    leagueWideRoles: rolesOf(row.league_wide_roles),
    onRoster: row.on_roster,
  }));
}
