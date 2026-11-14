// Ends a scoring session of a game of the scope's league (T-116): the row goes, so the
// session's id matches nothing from then on (0010). With `lapsedBy`, only if its lease
// had run out by then: a renewal that landed a moment earlier is re-checked after its
// lock is released and keeps the session. False if nothing was removed.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function deleteScoringSession(
  scope: LeagueScope,
  gameId: string,
  sessionId: string,
  lapsedBy?: number,
): Promise<boolean> {
  let query = transactionOf(scope)
    .deleteFrom('scoring_sessions')
    .where('league_id', '=', scope.leagueId)
    .where('game_id', '=', gameId)
    .where('id', '=', sessionId);
  if (lapsedBy !== undefined) query = query.where('held_until', '<=', new Date(lapsedBy));
  const row = await query.returning('id').executeTakeFirst();
  return row !== undefined;
}
