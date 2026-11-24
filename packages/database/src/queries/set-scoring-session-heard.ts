// Where the server last answered a game's holding scoring session (T-335): the game's
// sequence in its answer to a batch, kept on the session of a game of the scope's league.
// A session the game was taken from keeps the number it had (0026).
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function setScoringSessionHeard(
  scope: LeagueScope,
  gameId: string,
  sessionId: string,
  seq: number,
): Promise<void> {
  await transactionOf(scope)
    .updateTable('scoring_sessions')
    .set({ heard_seq: seq })
    .where('league_id', '=', scope.leagueId)
    .where('game_id', '=', gameId)
    .where('id', '=', sessionId)
    .where('lost_at', 'is', null)
    .execute();
}
