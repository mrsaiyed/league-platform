// Takes an account off a game of the scope's league it was assigned to score: the
// row goes (0009: "removing the assignment removes the row"). False if there was none.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function deleteGameAssignment(
  scope: LeagueScope,
  gameId: string,
  accountId: string,
): Promise<boolean> {
  const row = await transactionOf(scope)
    .deleteFrom('game_assignments')
    .where('league_id', '=', scope.leagueId)
    .where('game_id', '=', gameId)
    .where('account_id', '=', accountId)
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}
