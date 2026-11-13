// Adds a venue to the scope's league. Names differ, whatever the capitals, among the
// venues not in the bin (0007): a repeat comes back as 'name-taken', and the
// transaction is then unusable: the caller rolls it back.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { constraintOf } from './constraint-of.ts';

export type NewVenueRow = { name: string; address: string | null; mapLink: string | null };

/** The new venue's id, or 'name-taken'. */
export async function insertVenue(
  scope: LeagueScope,
  venue: NewVenueRow,
): Promise<string | 'name-taken'> {
  try {
    const row = await transactionOf(scope)
      .insertInto('venues')
      .values({
        league_id: scope.leagueId,
        name: venue.name,
        address: venue.address,
        map_link: venue.mapLink,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  } catch (error) {
    if (constraintOf(error)?.constraint === 'venues_name_key') return 'name-taken';
    throw error;
  }
}
