// Holds one game of the scope's league until the transaction ends (T-111): a second
// batch of tracker commands for that game waits here for the first to commit, then
// reads what it saved. It locks that one row only, so batches for other games never
// wait (T-112). `for no key update` is the lock an update of the row takes anyway: it
// does not hold up rows that point at the game (its events, its session), which take
// the weaker key-share lock. False if the game is not in the scope's league.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function lockLiveGame(scope: LeagueScope, gameId: string): Promise<boolean> {
  const row = await transactionOf(scope)
    .selectFrom('games')
    .select('id')
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', gameId)
    .forNoKeyUpdate()
    .executeTakeFirst();
  return row !== undefined;
}
