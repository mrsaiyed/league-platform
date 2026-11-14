// Renews a scoring session of a game of the scope's league (T-116): only `held_until`
// moves (the account, device and start are fixed, 0010). False if the session is no
// longer the game's, because it was taken over or released.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function extendScoringSession(
  scope: LeagueScope,
  gameId: string,
  sessionId: string,
  heldUntil: number,
): Promise<boolean> {
  const row = await transactionOf(scope)
    .updateTable('scoring_sessions')
    .set({ held_until: new Date(heldUntil) })
    .where('league_id', '=', scope.leagueId)
    .where('game_id', '=', gameId)
    .where('id', '=', sessionId)
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}
