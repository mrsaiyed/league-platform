// Saves the changes of a season's schedule draft in the scope's league, only if it is that
// draft and still at `version` (A-8, T-46). The new version, or undefined if it is not there or moved on.
import type { DraftDocument } from '@srleagues/core';
import type { JsonObject } from '../db/schema-types.ts';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function updateScheduleDraft(
  scope: LeagueScope,
  seasonId: string,
  draftId: string,
  changes: DraftDocument,
  version: number,
): Promise<number | undefined> {
  const row = await transactionOf(scope)
    .updateTable('schedule_drafts')
    .set({ changes: changes as unknown as JsonObject, version: version + 1 })
    .where('league_id', '=', scope.leagueId)
    .where('season_id', '=', seasonId)
    .where('id', '=', draftId)
    .where('version', '=', version)
    .returning('version')
    .executeTakeFirst();
  return row?.version;
}
