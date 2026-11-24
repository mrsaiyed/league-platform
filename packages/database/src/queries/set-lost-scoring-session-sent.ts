// How far "Send these plays" took a lost session's kept plays (T-335, 0026): the game's
// sequence after the last of their batches the server took, on a session a game of the
// scope's league was taken from.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function setLostScoringSessionSent(
  scope: LeagueScope,
  gameId: string,
  sessionId: string,
  seq: number,
): Promise<void> {
  await transactionOf(scope)
    .updateTable('scoring_sessions')
    .set({ sent_seq: seq })
    .where('league_id', '=', scope.leagueId)
    .where('game_id', '=', gameId)
    .where('id', '=', sessionId)
    .where('lost_at', 'is not', null)
    .execute();
}
