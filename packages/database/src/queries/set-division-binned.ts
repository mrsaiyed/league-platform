// Moves a division of the scope's league to the bin (`deleted_at` set; the row stays,
// A-5) or brings it back. It does not touch the division's sub-divisions: the command
// decides what that means (record 019). Bringing it back can hit a name a sibling took
// in the meantime (0007): 'name-taken', and the transaction is then unusable.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { constraintOf } from './constraint-of.ts';

/** False if it is not in the scope's league. */
export async function setDivisionBinned(
  scope: LeagueScope,
  divisionId: string,
  binned: boolean,
): Promise<boolean | 'name-taken'> {
  try {
    const row = await transactionOf(scope)
      .updateTable('divisions')
      .set({ deleted_at: binned ? new Date() : null })
      .where('league_id', '=', scope.leagueId)
      .where('id', '=', divisionId)
      .returning('id')
      .executeTakeFirst();
    return row !== undefined;
  } catch (error) {
    if (constraintOf(error)?.constraint === 'divisions_name_key') return 'name-taken';
    throw error;
  }
}
