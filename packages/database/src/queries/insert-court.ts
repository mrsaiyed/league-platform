// Adds a court to a venue of the scope's league. A venue's courts differ by name,
// whatever the capitals, while not in the bin (0007): a repeat comes back as
// 'name-taken', and the transaction is then unusable: the caller rolls it back. The
// venue is checked by the command first; the foreign key refuses the rest.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { constraintOf } from './constraint-of.ts';

export type NewCourtRow = { venueId: string; name: string; sort: number };

/** The new court's id, or 'name-taken'. */
export async function insertCourt(
  scope: LeagueScope,
  court: NewCourtRow,
): Promise<string | 'name-taken'> {
  try {
    const row = await transactionOf(scope)
      .insertInto('courts')
      .values({
        league_id: scope.leagueId,
        venue_id: court.venueId,
        name: court.name,
        sort: court.sort,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  } catch (error) {
    if (constraintOf(error)?.constraint === 'courts_name_key') return 'name-taken';
    throw error;
  }
}
