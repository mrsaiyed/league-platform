// The programs of the league in scope that are not in the bin (T-28: the league is
// required, and asked for again here although the database fences it too).
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { programSummary, programSummaryColumns, type ProgramSummary } from './program-summary.ts';

/** The league's programs, the default first, then by name. */
export async function listPrograms(scope: LeagueScope): Promise<ProgramSummary[]> {
  const rows = await transactionOf(scope)
    .selectFrom('programs')
    .select(programSummaryColumns)
    .where('league_id', '=', scope.leagueId)
    .where('deleted_at', 'is', null)
    .orderBy('is_default', 'desc')
    .orderBy('name')
    .orderBy('id')
    .execute();
  return rows.map(programSummary);
}
