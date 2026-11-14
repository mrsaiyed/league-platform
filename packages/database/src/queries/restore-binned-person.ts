// Brings a person of the scope's league back from the bin (`deleted_at` cleared). False
// if they are not there or were merged into another. A profile is one person in a league
// while not in the bin (0008), so bringing one back can meet a profile another person
// took meanwhile: 'profile-taken', and the transaction is then unusable.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { constraintOf } from './constraint-of.ts';

export async function restoreBinnedPerson(
  scope: LeagueScope,
  personId: string,
): Promise<boolean | 'profile-taken'> {
  try {
    const row = await transactionOf(scope)
      .updateTable('people')
      .set({ deleted_at: null })
      .where('league_id', '=', scope.leagueId)
      .where('id', '=', personId)
      .where('merged_into_id', 'is', null)
      .returning('id')
      .executeTakeFirst();
    return row !== undefined;
  } catch (error) {
    if (constraintOf(error)?.constraint === 'people_profile_once') return 'profile-taken';
    throw error;
  }
}
