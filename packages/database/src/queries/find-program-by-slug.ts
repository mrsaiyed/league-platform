// One program of the league in scope, by the short name in its address. A program
// in the bin is not found.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { programSummary, programSummaryColumns, type ProgramSummary } from './program-summary.ts';

/** The league's program with this short name, or undefined. */
export async function findProgramBySlug(
  scope: LeagueScope,
  slug: string,
): Promise<ProgramSummary | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('programs')
    .select(programSummaryColumns)
    .where('league_id', '=', scope.leagueId)
    .where('slug', '=', slug)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return row === undefined ? undefined : programSummary(row);
}
