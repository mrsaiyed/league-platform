// A game's saved engine state in the scope's league (T3 §8 `game_states`) with the last
// event it applied, or undefined if the game has none yet.
import type { SavedGameState } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findSavedGameState(
  scope: LeagueScope,
  gameId: string,
): Promise<SavedGameState | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('game_states')
    .select(['seq', 'state'])
    .where('league_id', '=', scope.leagueId)
    .where('game_id', '=', gameId)
    .executeTakeFirst();
  return row === undefined ? undefined : { seq: row.seq, state: row.state };
}
