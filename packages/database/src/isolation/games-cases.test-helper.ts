// The two-league harness's cases for games (step 2.23, T-65): every query in ../queries
// for them and every command of the same step. Imported by isolation-cases.test-helper.ts.
import {
  cancelGame,
  listPostponedGames as listPostponedGamesCommand,
  postponeGame,
  recordFinalScore,
  recordForfeit,
  reopenGame,
} from '@srleagues/core';
import { randomUUID } from 'node:crypto';
import {
  findGame,
  insertGameCorrection,
  listDecidedGameLines,
  listDecidedGames,
  listPostponedGames,
  updateGameResult,
} from '../queries/index.ts';
import type { LeagueScope } from '../db/transaction-scope.ts';
import { harnessTx, registerCommandCase, runInScope } from './command-cases.test-helper.ts';
import { registerIsolationCase } from './isolation-registry.test-helper.ts';
import type { LeagueRecords } from './two-leagues.test-helper.ts';

// Queries -----------------------------------------------------------------------------

registerIsolationCase({
  subject: findGame,
  name: "find the target's final game",
  run: (scope, target) => findGame(scope, target.gameId),
});

// The seeded games are not postponed, so these cases postpone the target's upcoming
// game first (in the run's own transaction, which is rolled back) to have one to list.
const postponeTargetGame = (scope: LeagueScope, target: LeagueRecords) =>
  updateGameResult(
    scope,
    target.upcomingGameId,
    { status: 'postponed', homeScore: null, awayScore: null, decided: false },
    1,
  );

registerIsolationCase({
  subject: listPostponedGames,
  name: "list the scope's postponed games after postponing the target's",
  run: async (scope, target) => {
    await postponeTargetGame(scope, target);
    return listPostponedGames(scope);
  },
});

// A season's results, as the games module gives them to standings (step 2.24).
registerIsolationCase({
  subject: listDecidedGames,
  name: "list the target's season's decided games",
  run: (scope, target) => listDecidedGames(scope, target.seasonId),
});

registerIsolationCase({
  subject: listDecidedGameLines,
  name: "list the lines of the target's season's decided games",
  run: (scope, target) => listDecidedGameLines(scope, target.seasonId),
});

registerIsolationCase({
  subject: updateGameResult,
  name: "postpone the target's upcoming game",
  run: (scope, target) =>
    updateGameResult(
      scope,
      target.upcomingGameId,
      { status: 'postponed', homeScore: null, awayScore: null, decided: false },
      1,
    ),
});

registerIsolationCase({
  subject: insertGameCorrection,
  name: "write a correction for the target's final game",
  run: (scope, target) =>
    insertGameCorrection(scope, {
      gameId: target.gameId,
      accountId: scope.accountId ?? randomUUID(),
      reason: 'Harness correction',
      before: { version: 1, status: 'final', homeScore: 52, awayScore: 48 },
      after: { version: 1, status: 'scheduled', homeScore: null, awayScore: null },
    }),
});

// Commands ----------------------------------------------------------------------------

registerCommandCase(recordFinalScore, harnessTx, {
  name: "record the target's upcoming game's final score",
  input: (target) => ({ gameId: target.upcomingGameId, version: 1, homeScore: 60, awayScore: 55 }),
});

registerCommandCase(recordForfeit, harnessTx, {
  name: "record a forfeit of the target's upcoming game",
  input: (target) => ({
    gameId: target.upcomingGameId,
    version: 1,
    forfeitingTeamId: target.teamId,
  }),
});

registerCommandCase(postponeGame, harnessTx, {
  name: "postpone the target's upcoming game",
  input: (target) => ({ gameId: target.upcomingGameId, version: 1 }),
});

registerCommandCase(cancelGame, harnessTx, {
  name: "cancel the target's upcoming game",
  input: (target) => ({ gameId: target.upcomingGameId, version: 1 }),
});

registerCommandCase(reopenGame, harnessTx, {
  name: "reopen the target's final game",
  input: (target) => ({ gameId: target.gameId, version: 1, reason: 'Harness reopening' }),
});

registerIsolationCase({
  subject: listPostponedGamesCommand,
  name: "list the scope's postponed games after postponing the target's",
  run: async (scope, target) => {
    await postponeTargetGame(scope, target);
    return runInScope(listPostponedGamesCommand, harnessTx, scope, {});
  },
});
