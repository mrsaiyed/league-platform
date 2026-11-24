// Renews a scoring session of a game of the scope's league (T-116): only `held_until`
// moves (the account, device and start are fixed, 0010), and only once the lease runs
// out before `dueBefore` (T-295: the tracker asks every few seconds, the row is written
// about once a minute). One statement: a session taken over or released matches
// nothing, so a renewal can never bring it back. False if nothing moved.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function extendScoringSession(
  scope: LeagueScope,
  gameId: string,
  sessionId: string,
  heldUntil: number,
  dueBefore: number,
): Promise<boolean> {
  const row = await transactionOf(scope)
    .updateTable('scoring_sessions')
    .set({ held_until: new Date(heldUntil) })
    .where('league_id', '=', scope.leagueId)
    .where('game_id', '=', gameId)
    .where('id', '=', sessionId)
    .where('lost_at', 'is', null)
    .where('held_until', '<', new Date(dueBefore))
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}
