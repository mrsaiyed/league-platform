// The schedule draft of a season of the scope's league, with its changes as stored (A-9).
// Undefined if the season has none.
import type { DraftRecord } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findScheduleDraft(
  scope: LeagueScope,
  seasonId: string,
): Promise<DraftRecord | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('schedule_drafts')
    .select(['season_id', 'changes', 'based_on_revision', 'version'])
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .executeTakeFirst();
  return row === undefined
    ? undefined
    : {
        seasonId: row.season_id,
        changes: row.changes,
        basedOnRevision: row.based_on_revision,
        version: row.version,
      };
}
