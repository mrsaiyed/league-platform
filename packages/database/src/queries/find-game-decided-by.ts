// Who decided a game of the scope's league by hand (step 2.177, migration 0028): the
// account in its `finalized_by`, which is written with the result, so it names the
// result the game has now. Null when nobody did (its tracker ended it, it is not
// decided, it was decided before 0028 or with no account) or the game is not here.
// The scorekeeper's reopen of their own result asks it, beside how long ago the game was
// decided (find-game-ended-ago.ts), both read inside the database.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findGameDecidedBy(
  scope: LeagueScope,
  gameId: string,
): Promise<string | null> {
  const row = await transactionOf(scope)
    .selectFrom('games')
    .select('finalized_by')
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', gameId)
    .executeTakeFirst();
  return row?.finalized_by ?? null;
}
