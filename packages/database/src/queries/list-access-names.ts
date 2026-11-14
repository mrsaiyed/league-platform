// The names on the Admins page (P4 §6): the display name of each account holding a
// grant in force in the scope's league, and of its owner, and nothing else about
// them (record 008). The fence lets an account read only its own accounts row, so
// this goes through the narrow function public.access_list_names (0012), which
// answers only for the league set for the transaction. Who may read the list is the
// access module's check (access.manage), made before this is called. A name is null
// when the account has not given one.
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export type AccessListName = {
  readonly accountId: string;
  readonly displayName: string | null;
};

export async function listAccessNames(scope: LeagueScope): Promise<AccessListName[]> {
  const { rows } = await sql<{ account_id: string; display_name: string | null }>`
    select account_id, display_name from public.access_list_names()
  `.execute(transactionOf(scope));
  return rows.map((row) => ({ accountId: row.account_id, displayName: row.display_name }));
}
