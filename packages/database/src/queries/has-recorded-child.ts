// Whether anyone in the scope's league, not in the bin, is recorded as a child, so an
// adult league's Privacy settings offer the parents' confirmation only where it has
// some (record 065). Yes or no only: nothing about who.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function hasRecordedChild(scope: LeagueScope): Promise<boolean> {
  const found = await transactionOf(scope)
    .selectFrom('people')
    .select('id')
    .where('league_id', '=', scope.leagueId)
    .where('is_minor', '=', true)
    .where('deleted_at', 'is', null)
    .limit(1)
    .executeTakeFirst();
  return found !== undefined;
}
