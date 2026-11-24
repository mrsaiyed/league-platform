// The format a game of the scope's league was given (step 2.119, migration 0026), as
// stored: null when it has none, undefined when the game is not in the scope's league.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findGameGivenFormat(scope: LeagueScope, gameId: string): Promise<unknown> {
  const row = await transactionOf(scope)
    .selectFrom('games')
    .select('given_format')
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', gameId)
    .executeTakeFirst();
  return row === undefined ? undefined : row.given_format;
}
