// The two-league harness's cases for games (step 2.23, T-65): every query in ../queries
// for them and every command of the same step. Imported by isolation-cases.test-helper.ts.
import {
  assignScorekeeper,
  cancelGame,
  listMyGames,
  listPostponedGames as listPostponedGamesCommand,
  postponeGame,
  recordFinalScore,
  recordForfeit,
  reopenGame,
  unassignScorekeeper,
} from '@srleagues/core';
import { sql } from 'kysely';
import { randomUUID } from 'node:crypto';
import {
  deleteGameAssignment,
  findGame,
  insertGameAssignment,
  insertGameCorrection,
  isGameAssigned,
  listDecidedGameLines,
  listDecidedGames,
  listGamesInWindow,
  listPostponedGames,
  updateGameResult,
} from '../queries/index.ts';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { harnessTx, registerCommandCase, runAsApp } from './command-cases.test-helper.ts';
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

// Scorekeepers (step 2.27) ---------------------------------------------------------

// The seeded upcoming game is a week past the seed's dates, so these cases bring the
// target's upcoming game to within the hour first (in the run's own rolled-back
// transaction; another league's scope changes nothing), to have one to list.
const bringTargetGameNear = (scope: LeagueScope, target: LeagueRecords) =>
  sql`update games set starts_at = now() + interval '1 hour'
      where league_id = ${scope.leagueId} and id = ${target.upcomingGameId}`.execute(
    transactionOf(scope),
  );

// A case that writes uses a game of the scope's own league, so a refusal never names
// the target's ids; with none in sight it uses an id that is nowhere.
async function ownUpcomingGameId(scope: LeagueScope) {
  const row = await transactionOf(scope)
    .selectFrom('games')
    .select('id')
    .where('league_id', '=', scope.leagueId)
    .where('status', '=', 'scheduled')
    .orderBy('id')
    .executeTakeFirst();
  return row?.id ?? randomUUID();
}

registerIsolationCase({
  subject: isGameAssigned,
  name: "whether the target's member is assigned to its upcoming game",
  run: (scope, target) => isGameAssigned(scope, target.upcomingGameId, target.memberId),
});

registerIsolationCase({
  subject: insertGameAssignment,
  name: "assign the scope's account to a game of the scope's league",
  run: async (scope) =>
    insertGameAssignment(scope, await ownUpcomingGameId(scope), scope.accountId ?? randomUUID()),
});

registerIsolationCase({
  subject: deleteGameAssignment,
  name: "take the target's member off its upcoming game",
  run: (scope, target) => deleteGameAssignment(scope, target.upcomingGameId, target.memberId),
});

registerIsolationCase({
  subject: listGamesInWindow,
  name: "list this week's games after bringing the target's upcoming game near",
  run: async (scope, target) => {
    await bringTargetGameNear(scope, target);
    return listGamesInWindow(scope, target.memberId, 7);
  },
});

registerCommandCase(assignScorekeeper, harnessTx, {
  // The target's owner may score any of its games, so may be assigned.
  name: "assign the target's owner to the target's upcoming game",
  input: (target) => ({ gameId: target.upcomingGameId, accountId: target.ownerId }),
});

registerCommandCase(unassignScorekeeper, harnessTx, {
  name: "take the target's member off the target's upcoming game",
  input: (target) => ({ gameId: target.upcomingGameId, accountId: target.memberId }),
});

registerIsolationCase({
  subject: listMyGames,
  name: "list the scope's account's games after bringing the target's upcoming game near",
  run: async (scope, target) => {
    await bringTargetGameNear(scope, target);
    return runAsApp(listMyGames, harnessTx, scope, {});
  },
});

registerIsolationCase({
  subject: listPostponedGamesCommand,
  name: "list the scope's postponed games after postponing the target's",
  run: async (scope, target) => {
    await postponeTargetGame(scope, target);
    return runAsApp(listPostponedGamesCommand, harnessTx, scope, {});
  },
});
