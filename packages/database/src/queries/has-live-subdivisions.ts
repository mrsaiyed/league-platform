// Whether any division of the scope's league that is not in the bin sits under this one.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function hasLiveSubdivisions(
  scope: LeagueScope,
  divisionId: string,
): Promise<boolean> {
  const row = await transactionOf(scope)
    .selectFrom('divisions')
    .select('id')
    .where('league_id', '=', scope.leagueId)
    .where('parent_division_id', '=', divisionId)
    .where('deleted_at', 'is', null)
    .limit(1)
    .executeTakeFirst();
  return row !== undefined;
}
