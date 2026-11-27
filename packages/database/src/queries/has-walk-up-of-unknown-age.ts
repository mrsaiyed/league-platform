// Whether anyone in the scope's league, not in the bin, counts as a child only because
// they were added at a scorer's table with no age (S-136 as amended in step 2.146's fix
// round), so an adult league's Privacy settings offer the parents' confirmation and say
// how to mark them. Yes or no only: nothing about who. Never the S-109 put-back's
// question (has-recorded-child.ts), which stays with what an admin recorded.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { walkUpOfUnknownAgeSql } from './minor-by-age-sql.ts';

export async function hasWalkUpOfUnknownAge(scope: LeagueScope): Promise<boolean> {
  const found = await transactionOf(scope)
    .selectFrom('people')
    .select('id')
    .where('league_id', '=', scope.leagueId)
    .where('deleted_at', 'is', null)
    .where('merged_into_id', 'is', null)
    .where(walkUpOfUnknownAgeSql())
    .limit(1)
    .executeTakeFirst();
  return found !== undefined;
}
