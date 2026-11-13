// Whether an account is assigned to score a game of the scope's league (T3 §8
// `game_assignments`, P7 §5.1). Read fresh on every check, so an assignment taken
// away a moment ago counts for nothing (T-75).
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function isGameAssigned(
  scope: LeagueScope,
  gameId: string,
  accountId: string,
): Promise<boolean> {
  const row = await transactionOf(scope)
    .selectFrom('game_assignments')
    .select('id')
    .where('league_id', '=', scope.leagueId)
    .where('game_id', '=', gameId)
    .where('account_id', '=', accountId)
    .executeTakeFirst();
  return row !== undefined;
}
