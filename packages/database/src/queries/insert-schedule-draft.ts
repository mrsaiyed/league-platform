// Starts a season's schedule draft in the scope's league: its version (1), or 'exists' if
// the season already has one (one draft per season; nothing is raised, so the transaction
// stays usable).
import type { DraftDocument } from '@srleagues/core';
import type { JsonObject } from '../db/schema-types.ts';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function insertScheduleDraft(
  scope: LeagueScope,
  seasonId: string,
  changes: DraftDocument,
  basedOnRevision: number | null,
): Promise<number | 'exists'> {
  const row = await transactionOf(scope)
    .insertInto('schedule_drafts')
    .values({
      league_id: scope.leagueId,
      season_id: seasonId,
      changes: changes as unknown as JsonObject,
      based_on_revision: basedOnRevision,
    })
    .onConflict((conflict) => conflict.constraint('schedule_drafts_one_per_season').doNothing())
    .returning('version')
    .executeTakeFirst();
  return row?.version ?? 'exists';
}
