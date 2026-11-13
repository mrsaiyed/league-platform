// Assigns an account to score a game of the scope's league (P7 §5.1): true, or false
// when it already was, even by a concurrent request a moment ago
// (game_assignments_once; nothing is thrown, so the transaction stays usable). A game
// of another league is refused by the database (game_assignments_game, T-60).
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function insertGameAssignment(
  scope: LeagueScope,
  gameId: string,
  accountId: string,
): Promise<boolean> {
  const row = await transactionOf(scope)
    .insertInto('game_assignments')
    .values({ league_id: scope.leagueId, game_id: gameId, account_id: accountId })
    .onConflict((conflict) => conflict.columns(['league_id', 'game_id', 'account_id']).doNothing())
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}
