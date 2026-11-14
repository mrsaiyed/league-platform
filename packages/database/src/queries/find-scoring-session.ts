// The scoring session of a game of the scope's league (T3 §8, T-116), whether its
// lease has run out or not: the command decides what a lapsed one means. Undefined if
// the game has none, or is not in the scope's league.
import type { ScoringSession } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { scoringSessionColumns, scoringSessionSummary } from './scoring-session-summary.ts';

export async function findScoringSession(
  scope: LeagueScope,
  gameId: string,
): Promise<ScoringSession | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('scoring_sessions')
    .select(scoringSessionColumns)
    .where('league_id', '=', scope.leagueId)
    .where('game_id', '=', gameId)
    .executeTakeFirst();
  return row === undefined ? undefined : scoringSessionSummary(row);
}
