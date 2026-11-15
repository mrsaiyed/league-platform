// Gives a person of the scope's league the name typed at the scorer's table (record
// 058, S-45): the command allows it only for a player added at a scorer's table and
// still waiting for review. The name before is kept on the person (`previous_*`, 0015),
// where an admin's review can show it and put it back; it never goes into the activity
// log or the game's events. The entry is marked for review again. Either part may be
// empty (S-34); the table's checks refuse a part of only spaces (0008). Run in a
// savepoint (in-savepoint.ts): a refusal is `failed`, never thrown.
import type { TablePlayerRefusal } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { inSavepoint } from './in-savepoint.ts';

export async function renameTablePlayer(
  scope: LeagueScope,
  entryId: string,
  personId: string,
  firstName: string,
  lastName: string,
): Promise<'renamed' | TablePlayerRefusal> {
  try {
    return await inSavepoint(scope, async () => {
      const tx = transactionOf(scope);
      await tx
        .updateTable('people')
        .set({
          previous_first_name: sql<string>`first_name`,
          previous_last_name: sql<string>`last_name`,
          first_name: firstName,
          last_name: lastName,
        })
        .where('league_id', '=', scope.leagueId)
        .where('id', '=', personId)
        .execute();
      await tx
        .updateTable('roster_entries')
        .set({ needs_review: true })
        .where('league_id', '=', scope.leagueId)
        .where('id', '=', entryId)
        .where('person_id', '=', personId)
        .execute();
      return 'renamed' as const;
    });
  } catch {
    return 'failed';
  }
}
