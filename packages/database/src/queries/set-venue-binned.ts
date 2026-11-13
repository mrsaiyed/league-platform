// Moves a venue of the scope's league to the bin (`deleted_at` set; the row stays, A-5)
// or brings it back. It does not touch the venue's courts: the command refuses to bin
// a venue with courts (record 019). Bringing it back can hit a name another venue took
// meanwhile (0007): 'name-taken', and the transaction is then unusable.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { constraintOf } from './constraint-of.ts';

/** False if it is not in the scope's league. */
export async function setVenueBinned(
  scope: LeagueScope,
  venueId: string,
  binned: boolean,
): Promise<boolean | 'name-taken'> {
  try {
    const row = await transactionOf(scope)
      .updateTable('venues')
      .set({ deleted_at: binned ? new Date() : null })
      .where('league_id', '=', scope.leagueId)
      .where('id', '=', venueId)
      .returning('id')
      .executeTakeFirst();
    return row !== undefined;
  } catch (error) {
    if (constraintOf(error)?.constraint === 'venues_name_key') return 'name-taken';
    throw error;
  }
}
