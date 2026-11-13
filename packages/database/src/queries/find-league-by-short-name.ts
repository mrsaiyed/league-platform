// The league a short name in an address names (U-7, T-221): the one question a
// request can ask before any league is set. It goes through the narrow function
// public.find_league_by_slug (0005, record 008), which answers for one name at a
// time and returns only these columns, so it cannot list leagues. Run in a
// transaction with no league set (an AppScope); apps/web/src/server/context.ts is
// what calls it.
import { sql } from 'kysely';
import { transactionOf, type AppScope } from '../db/transaction-scope.ts';

export type LeagueByShortName = {
  readonly leagueId: string;
  /** Its current short name: different from the one asked for if that one is a former name. */
  readonly slug: string;
  readonly status: 'draft' | 'live' | 'archived' | 'suspended';
  readonly inBin: boolean;
  /** True when the name asked for is a former one, still forwarding (U-7). */
  readonly forwarded: boolean;
};

type Row = {
  league_id: string;
  slug: string;
  status: string;
  in_bin: boolean;
  forwarded: boolean;
};

export async function findLeagueByShortName(
  scope: AppScope,
  shortName: string,
): Promise<LeagueByShortName | undefined> {
  const { rows } = await sql<Row>`
    select league_id, slug, status, in_bin, forwarded
    from public.find_league_by_slug(${shortName})
  `.execute(transactionOf(scope));
  const row = rows[0];
  if (row === undefined) return undefined;
  const status = row.status;
  if (status !== 'draft' && status !== 'live' && status !== 'archived' && status !== 'suspended') {
    throw new Error('A league has a state the leagues table does not allow.');
  }
  return {
    leagueId: row.league_id,
    slug: row.slug,
    status,
    inBin: row.in_bin,
    forwarded: row.forwarded,
  };
}
