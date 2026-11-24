// A scoring session a game of the scope's league was taken from (T-335, 0026): whose it
// was, where the server last heard it, and how far "Send these plays" took its kept
// plays. Undefined for a session that holds the game, ended another way, or is not there.
import type { LostScoringSession } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';

export async function findLostScoringSession(
  scope: LeagueScope,
  gameId: string,
  sessionId: string,
): Promise<LostScoringSession | undefined> {
  const row = await transactionOf(scope)
    .selectFrom('scoring_sessions')
    .select(['id', 'account_id', 'heard_seq', 'sent_seq'])
    .where('league_id', '=', scope.leagueId)
    .where('game_id', '=', gameId)
    .where('id', '=', sessionId)
    .where('lost_at', 'is not', null)
    .executeTakeFirst();
  if (row === undefined) return undefined;
  return {
    id: row.id,
    accountId: row.account_id,
    heardSeq: row.heard_seq,
    ...(row.sent_seq === null ? {} : { sentSeq: row.sent_seq }),
  };
}
