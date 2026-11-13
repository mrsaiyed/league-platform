// The program a season of the scope's league belongs to, so a permission can be
// checked where the season is (P4 §4: a role limited to one program). Undefined if
// the season is not in the scope's league or is in the bin.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findSeasonProgramId(
  scope: LeagueScope,
  seasonId: string,
): Promise<string | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('seasons')
    .select('program_id')
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', seasonId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return row?.program_id;
}
