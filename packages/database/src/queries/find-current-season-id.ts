// The current season of a program of the scope's league (T3 §12: at most one), not in
// the bin: what "Start a new season" copies from (step 2.130). Undefined when none is.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findCurrentSeasonId(
  scope: LeagueScope,
  programId: string,
): Promise<string | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('seasons')
    .select('id')
    .where('league_id', '=', scope.leagueId)
    .where('program_id', '=', programId)
    .where('is_current', '=', true)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return row?.id;
}
