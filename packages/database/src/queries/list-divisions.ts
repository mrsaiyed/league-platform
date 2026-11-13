// A season's divisions that are not in the bin, in order: by sort, then name. Every
// level is listed together; each names its parent.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import {
  divisionSummary,
  divisionSummaryColumns,
  type DivisionSummary,
} from './division-summary.ts';

export async function listDivisions(
  scope: LeagueScope,
  seasonId: string,
): Promise<DivisionSummary[]> {
  const rows = await transactionOf(scope)
    .selectFrom('divisions')
    .select(divisionSummaryColumns)
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where('deleted_at', 'is', null)
    .orderBy('sort')
    .orderBy('name')
    .orderBy('id')
    .execute();
  return rows.map(divisionSummary);
}
