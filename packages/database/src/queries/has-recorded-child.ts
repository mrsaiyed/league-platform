// Whether anyone in the scope's league, not in the bin, is recorded as a child, so an
// adult league's Privacy settings offer the parents' confirmation only where it has
// some (record 065). Yes or no only: nothing about who. A child by birth date counts
// whatever the tick says, and an adult by birth date does not (R-28, minor-by-age-sql.ts).
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { isMinorSql } from './minor-by-age-sql.ts';

export async function hasRecordedChild(scope: LeagueScope): Promise<boolean> {
  const found = await transactionOf(scope)
    .selectFrom('people')
    .select('id')
    .where('league_id', '=', scope.leagueId)
    .where(sql<boolean>`${isMinorSql()} is true`)
    .where('deleted_at', 'is', null)
    .limit(1)
    .executeTakeFirst();
  return found !== undefined;
}
