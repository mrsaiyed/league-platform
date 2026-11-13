// A season's rules as stored, in the scope's league (read them with upgradeSeasonRules);
// undefined if the season is not in the scope's league or is in the bin.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findSeasonRules(scope: LeagueScope, seasonId: string): Promise<unknown> {
  const row = await transactionOf(scope)
    .selectFrom('seasons')
    .select('rules')
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', seasonId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return row?.rules;
}
