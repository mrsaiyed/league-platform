// The games module's scoring sessions (core's ScoringSessionsStore, T-116), bound to
// one league scope.
import type { ScoringSessionsStore } from '@srleagues/core';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  deleteScoringSession,
  extendScoringSession,
  findLastEventSeq,
  findLostScoringSession,
  findScoringSession,
  insertScoringSession,
  lockLiveGame,
  loseScoringSession,
  setLostScoringSessionSent,
  setScoringSessionHeard,
} from '../queries/index.ts';

export function scoringSessionsStore(scope: LeagueScope): ScoringSessionsStore {
  return {
    lockGame: (gameId) => lockLiveGame(scope, gameId),
    findForGame: (gameId) => findScoringSession(scope, gameId),
    // Heard at the game's last event when it begins (T-335): what its device loads.
    start: async (session) =>
      insertScoringSession(scope, session, await findLastEventSeq(scope, session.gameId)),
    extend: (gameId, sessionId, heldUntil, dueBefore) =>
      extendScoringSession(scope, gameId, sessionId, heldUntil, dueBefore),
    end: (gameId, sessionId, lapsedBy) => deleteScoringSession(scope, gameId, sessionId, lapsedBy),
    lose: (gameId, sessionId, at, lapsedBy) =>
      loseScoringSession(scope, gameId, sessionId, at, lapsedBy),
    heard: (gameId, sessionId, seq) => setScoringSessionHeard(scope, gameId, sessionId, seq),
    findLost: (gameId, sessionId) => findLostScoringSession(scope, gameId, sessionId),
    sent: (gameId, sessionId, seq) => setLostScoringSessionSent(scope, gameId, sessionId, seq),
  };
}
