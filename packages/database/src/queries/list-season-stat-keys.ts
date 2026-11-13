// The statistics a season keeps, in its order; undefined if the season is not in the
// scope's league or is in the bin.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function listSeasonStatKeys(
  scope: LeagueScope,
  seasonId: string,
): Promise<string[] | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('seasons')
    .select('stat_keys')
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', seasonId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return row === undefined ? undefined : row.stat_keys.filter((key): key is string => key !== null);
}
