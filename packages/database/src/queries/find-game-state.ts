// The engine's saved state of a game (T3 §8) as stored, or undefined if it has none.
// The public read picks out of it only what a visitor may see.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findGameState(scope: LeagueScope, gameId: string): Promise<unknown> {
  const row = await transactionOf(scope)
    .selectFrom('game_states')
    .select('state')
    .where('league_id', '=', scope.leagueId)
    .where('game_id', '=', gameId)
    .executeTakeFirst();
  return row?.state;
}
