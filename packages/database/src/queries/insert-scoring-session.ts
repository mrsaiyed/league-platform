// Starts the scoring session of a game of the scope's league (T-116), unless the game
// already has one (scoring_sessions_one_per_game), even one a concurrent request
// started a moment ago: that request's insert is waited for, and this one then does
// nothing and returns undefined. Nothing is thrown, so the transaction stays usable
// to read who holds the game. A game of another league is refused by the database
// (scoring_sessions_game, T-60). The session's start is the server clock's, given by
// the command, so `since` never depends on the database's clock.
import type { NewScoringSession, ScoringSession } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { scoringSessionColumns, scoringSessionSummary } from './scoring-session-summary.ts';

export async function insertScoringSession(
  scope: LeagueScope,
  session: NewScoringSession,
): Promise<ScoringSession | undefined> {
  const row = await transactionOf(scope)
    .insertInto('scoring_sessions')
    .values({
      league_id: scope.leagueId,
      game_id: session.gameId,
      account_id: session.accountId,
      device_id: session.deviceId,
      created_at: new Date(session.since),
      held_until: new Date(session.heldUntil),
    })
    .onConflict((conflict) => conflict.columns(['league_id', 'game_id']).doNothing())
    .returning(scoringSessionColumns)
    .executeTakeFirst();
  return row === undefined ? undefined : scoringSessionSummary(row);
}
