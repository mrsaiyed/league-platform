// The games module's scoring sessions (core's ScoringSessionsStore, T-116), bound to
// one league scope.
import type { ScoringSessionsStore } from '@srleagues/core';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  deleteScoringSession,
  extendScoringSession,
  findScoringSession,
  insertScoringSession,
} from '../queries/index.ts';

export function scoringSessionsStore(scope: LeagueScope): ScoringSessionsStore {
  return {
    findForGame: (gameId) => findScoringSession(scope, gameId),
    start: (session) => insertScoringSession(scope, session),
    extend: (gameId, sessionId, heldUntil) =>
      extendScoringSession(scope, gameId, sessionId, heldUntil),
    end: (gameId, sessionId, lapsedBy) => deleteScoringSession(scope, gameId, sessionId, lapsedBy),
  };
}
