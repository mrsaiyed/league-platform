// Gives a roster entry of the scope's league a new number, or none, at the scorer's
// table (record 058, S-37). Where the season wants unique numbers the database refuses
// one someone on the team wears (0008); run in a savepoint (in-savepoint.ts), so that
// refusal leaves the batch's transaction usable.
import type { TablePlayerRefusal } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { constraintOf } from './constraint-of.ts';
import { inSavepoint } from './in-savepoint.ts';

export async function setTablePlayerNumber(
  scope: LeagueScope,
  entryId: string,
  jerseyNumber: string | null,
): Promise<'changed' | TablePlayerRefusal> {
  try {
    return await inSavepoint(scope, async () => {
      await transactionOf(scope)
        .updateTable('roster_entries')
        .set({ jersey_number: jerseyNumber })
        .where('league_id', '=', scope.leagueId)
        .where('id', '=', entryId)
        .execute();
      return 'changed' as const;
    });
  } catch (error) {
    if (constraintOf(error)?.constraint === 'roster_entries_unique_jersey') return 'jersey-taken';
    throw error;
  }
}
