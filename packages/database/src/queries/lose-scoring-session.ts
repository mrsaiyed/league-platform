// Takes a game of the scope's league from its scoring session (T-116, T-335): a takeover,
// or a lapse given away. Unlike deleteScoringSession the row is kept, marked lost, so it
// holds nothing from then on (find, extend and the one-per-game rule pass it by, 0026)
// while the server still knows whose it was and where it was last heard, for "Send
// these plays". With `lapsedBy`, only if its lease had run out by then. False if nothing
// was taken.
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function loseScoringSession(
  scope: LeagueScope,
  gameId: string,
  sessionId: string,
  lostAt: number,
  lapsedBy?: number,
): Promise<boolean> {
  let query = transactionOf(scope)
    .updateTable('scoring_sessions')
    .set({ lost_at: new Date(lostAt) })
    .where('league_id', '=', scope.leagueId)
    .where('game_id', '=', gameId)
    .where('id', '=', sessionId)
    .where('lost_at', 'is', null);
  if (lapsedBy !== undefined) query = query.where('held_until', '<=', new Date(lapsedBy));
  const row = await query.returning('id').executeTakeFirst();
  return row !== undefined;
}
