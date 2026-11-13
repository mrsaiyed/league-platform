// Moves a person of the scope's league to the bin (`deleted_at` set; the row stays,
// A-5) or brings them back. Bringing one back can meet the rule that a profile is one
// person while not in the bin (0008); that is for the restore command (step 2.76).
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

/** False if the person is not in the scope's league. */
export async function setPersonBinned(
  scope: LeagueScope,
  personId: string,
  binned: boolean,
): Promise<boolean> {
  const row = await transactionOf(scope)
    .updateTable('people')
    .set({ deleted_at: binned ? new Date() : null })
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', personId)
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}
