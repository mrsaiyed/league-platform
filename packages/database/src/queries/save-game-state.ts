// Writes the engine's state of a game of the scope's league as of event `seq` (T3 §8
// `game_states`, one per game): the first time, or over the last one, in the same
// transaction as the events that made it (T6 §1).
import type { JsonObject } from '../db/schema-types.ts';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function saveGameState(
  scope: LeagueScope,
  gameId: string,
  seq: number,
  state: unknown,
): Promise<void> {
  const document = state as JsonObject;
  await transactionOf(scope)
    .insertInto('game_states')
    .values({ league_id: scope.leagueId, game_id: gameId, seq, state: document })
    .onConflict((conflict) =>
      conflict.columns(['league_id', 'game_id']).doUpdateSet({ seq, state: document }),
    )
    .execute();
}
