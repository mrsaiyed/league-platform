// A division of the scope's league by id, in the bin or not (the commands decide what
// a binned one means). Undefined if it is not in the scope's league.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import {
  divisionSummary,
  divisionSummaryColumns,
  type DivisionSummary,
} from './division-summary.ts';

export async function findDivision(
  scope: LeagueScope,
  divisionId: string,
): Promise<DivisionSummary | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('divisions')
    .select(divisionSummaryColumns)
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', divisionId)
    .executeTakeFirst();
  return row === undefined ? undefined : divisionSummary(row);
}
