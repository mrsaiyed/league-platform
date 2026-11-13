// Changes the name, address or map link of a venue of the scope's league that is not in
// the bin, only if it is still at `version` (T-46). A name another venue has comes back
// as 'name-taken', and the transaction is then unusable: the caller rolls it back.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { constraintOf } from './constraint-of.ts';

export type VenueChangeRow = {
  name?: string;
  address?: string | null;
  mapLink?: string | null;
};

/** The new version, 'name-taken', or undefined if it is not there, is in the bin or moved on. */
export async function updateVenue(
  scope: LeagueScope,
  venueId: string,
  change: VenueChangeRow,
  version: number,
): Promise<number | 'name-taken' | undefined> {
  try {
    const row = await transactionOf(scope)
      .updateTable('venues')
      .set({
        ...(change.name === undefined ? {} : { name: change.name }),
        ...(change.address === undefined ? {} : { address: change.address }),
        ...(change.mapLink === undefined ? {} : { map_link: change.mapLink }),
      })
      .where('league_id', '=', scope.leagueId)
      .where('id', '=', venueId)
      .where('version', '=', version)
      .where('deleted_at', 'is', null)
      .returning('version')
      .executeTakeFirst();
    return row?.version;
  } catch (error) {
    if (constraintOf(error)?.constraint === 'venues_name_key') return 'name-taken';
    throw error;
  }
}
