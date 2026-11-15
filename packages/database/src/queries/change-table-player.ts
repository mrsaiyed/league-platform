// Changes a player at the scorer's table in the scope's league (record 058, S-37,
// S-45): their roster entry's number, their person's name, or both, together or not at
// all, in one savepoint (in-savepoint.ts), so one command never half-applies. Where the
// season wants unique numbers the database refuses one someone on the team wears
// (0008, 0015): `jersey-taken`; any other refusal is `failed`, never thrown. A rename
// keeps the name the player was first given (`previous_*`, 0015) the first time only, so
// a second rename never loses it; an admin's review shows it and can put it back. It
// never goes into the activity log or the game's events. The command allows a rename
// only for a player added at a scorer's table who still waits for review.
import type { TablePlayerChange, TablePlayerRefusal } from '@srleagues/core';
import { sql } from 'kysely';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { constraintOf } from './constraint-of.ts';
import { inSavepoint } from './in-savepoint.ts';

export async function changeTablePlayer(
  scope: LeagueScope,
  entryId: string,
  personId: string,
  change: TablePlayerChange,
): Promise<'changed' | TablePlayerRefusal> {
  try {
    return await inSavepoint(scope, async () => {
      const tx = transactionOf(scope);
      if (change.jerseyNumber !== undefined) {
        await tx
          .updateTable('roster_entries')
          .set({ jersey_number: change.jerseyNumber })
          .where('league_id', '=', scope.leagueId)
          .where('id', '=', entryId)
          .where('person_id', '=', personId)
          .execute();
      }
      if (change.firstName !== undefined || change.lastName !== undefined) {
        // The first name given is kept: written only while nothing is kept yet.
        const untouched = sql<boolean>`previous_first_name is null and previous_last_name is null`;
        await tx
          .updateTable('people')
          .set({
            previous_first_name: sql<string>`case when ${untouched} then first_name else previous_first_name end`,
            previous_last_name: sql<string>`case when ${untouched} then last_name else previous_last_name end`,
            ...(change.firstName === undefined ? {} : { first_name: change.firstName }),
            ...(change.lastName === undefined ? {} : { last_name: change.lastName }),
          })
          .where('league_id', '=', scope.leagueId)
          .where('id', '=', personId)
          .execute();
      }
      return 'changed' as const;
    });
  } catch (error) {
    if (constraintOf(error)?.constraint === 'roster_entries_unique_jersey') return 'jersey-taken';
    return 'failed';
  }
}
