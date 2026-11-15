// Gives a person of the scope's league the name typed at the scorer's table (record
// 058): the command allows it only for a player added at a scorer's table. Either part
// may be empty (S-34); the table's checks refuse a part of only spaces (0008).
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function renameTablePlayer(
  scope: LeagueScope,
  personId: string,
  firstName: string,
  lastName: string,
): Promise<void> {
  await transactionOf(scope)
    .updateTable('people')
    .set({ first_name: firstName, last_name: lastName })
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', personId)
    .execute();
}
