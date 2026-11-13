// Whether any team of the scope's league that is not in the bin sits in this division.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function hasLiveTeams(scope: LeagueScope, divisionId: string): Promise<boolean> {
  const row = await transactionOf(scope)
    .selectFrom('teams')
    .select('id')
    .where('league_id', '=', scope.leagueId)
    .where('division_id', '=', divisionId)
    .where('deleted_at', 'is', null)
    .limit(1)
    .executeTakeFirst();
  return row !== undefined;
}
