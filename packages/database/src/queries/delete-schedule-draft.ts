// Discards a season's schedule draft in the scope's league, only if it is that draft
// and still at `version` (A-9, A-8). False if it is not there or moved on.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function deleteScheduleDraft(
  scope: LeagueScope,
  seasonId: string,
  draftId: string,
  version: number,
): Promise<boolean> {
  const row = await transactionOf(scope)
    .deleteFrom('schedule_drafts')
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where('id', '=', draftId)
    .where('version', '=', version)
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}
