// The two-league harness's cases for games (step 2.23, T-65): every query in ../queries
// for them and every command of the same step. Imported by isolation-cases.test-helper.ts.
import {
  applyTrackerCommands,
  assignScorekeeper,
  cancelGame,
  getBoxScoreSheet,
  listMyGames,
  listPostponedGames as listPostponedGamesCommand,
  openScoringSession,
  postponeGame,
  recordFinalScore,
  recordForfeit,
  releaseScoringSession,
  renewScoringSession,
  reopenGame,
  setBoxScore,
  takeOverScoring,
  unassignScorekeeper,
} from '@srleagues/core';
import { sql } from 'kysely';
import { randomUUID } from 'node:crypto';
import {
  deleteGameAssignment,
  deleteScoringSession,
  extendScoringSession,
  findScoringSession,
  insertScoringSession,
  findSavedGameState,
  insertGameEvents,
  listGamePlayers,
  listTakenCommands,
  lockLiveGame,
  saveGameLines,
  saveGameState,
  findGame,
  gameHasPlays,
  insertGameAssignment,
  insertGameCorrection,
  isGameAssigned,
  listDecidedGameLines,
  listDecidedGames,
  listGameLines,
  listGameRoster,
  listGamesInWindow,
  listPostponedGames,
  replaceGameLines,
  updateGameResult,
} from '../queries/index.ts';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import {
  CommandRefused,
  harnessTx,
  registerCommandCase,
  runAsApp,
} from './command-cases.test-helper.ts';
import { registerIsolationCase } from './isolation-registry.test-helper.ts';
import { harnessNow, type LeagueRecords } from './two-leagues.test-helper.ts';

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

// Box scores entered afterwards (step 2.64) -------------------------------------------

registerIsolationCase({
  subject: listGameLines,
  name: "list the lines of the target's final game",
  run: (scope, target) => listGameLines(scope, target.gameId),
});

registerIsolationCase({
  subject: listGameRoster,
  name: "list the players of the target's upcoming game",
  run: (scope, target) => listGameRoster(scope, target.upcomingGameId),
});

registerIsolationCase({
  subject: gameHasPlays,
  name: "whether the target's final game has plays",
  run: (scope, target) => gameHasPlays(scope, target.gameId),
});

registerIsolationCase({
  subject: replaceGameLines,
  name: "clear the lines of the target's final game",
  run: (scope, target) => replaceGameLines(scope, target.gameId, []),
});

registerIsolationCase({
  subject: replaceGameLines,
  name: "replace the lines of the target's upcoming game with its player's",
  run: (scope, target) =>
    replaceGameLines(scope, target.upcomingGameId, [
      {
        gameId: target.upcomingGameId,
        teamId: target.teamId,
        personId: target.personId,
        jerseyNumber: null,
        played: true,
        secondsPlayed: null,
        stats: { points: 7 },
      },
    ]),
});

registerCommandCase(setBoxScore, harnessTx, {
  name: "enter the box score of the target's upcoming game",
  input: (target) => ({
    gameId: target.upcomingGameId,
    version: 1,
    homeScore: 30,
    awayScore: 20,
    lines: [
      {
        teamId: target.teamId,
        personId: target.personId,
        played: true,
        secondsPlayed: null,
        stats: { points: 12 },
      },
    ],
  }),
});

registerCommandCase(getBoxScoreSheet, harnessTx, {
  name: "read the box score sheet of the target's upcoming game",
  input: (target) => ({ gameId: target.upcomingGameId }),
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

// Scoring sessions (step 2.28) -------------------------------------------------------

// The target's member holds its upcoming game on a tablet. The seed sets when that
// session began and when its lease runs out, and the harness's clock is fixed half a
// minute into it (harnessNow), so in every run the lease holds and a takeover naming
// its start succeeds, whatever the time of day.

registerIsolationCase({
  subject: findScoringSession,
  name: "find the session scoring the target's upcoming game",
  run: (scope, target) => findScoringSession(scope, target.upcomingGameId),
});

registerIsolationCase({
  subject: insertScoringSession,
  // The scope's own game is held already, so its session is ended first (in the run's
  // own rolled-back transaction) to have a game to start one on.
  name: "start a session on a game of the scope's league",
  run: async (scope) => {
    const gameId = await ownUpcomingGameId(scope);
    await transactionOf(scope)
      .deleteFrom('scoring_sessions')
      .where('league_id', '=', scope.leagueId)
      .where('game_id', '=', gameId)
      .execute();
    // Set times, so every run returns the same answer apart from the new session's id.
    const since = Date.UTC(2026, 11, 13, 19, 0, 0);
    return insertScoringSession(scope, {
      gameId,
      accountId: scope.accountId ?? randomUUID(),
      deviceId: 'harness-device',
      since,
      heldUntil: since + 120_000,
    });
  },
});

registerIsolationCase({
  subject: extendScoringSession,
  name: "renew the session scoring the target's upcoming game",
  run: (scope, target) =>
    extendScoringSession(
      scope,
      target.upcomingGameId,
      target.scoringSessionId,
      harnessNow + 120_000,
    ),
});

registerIsolationCase({
  subject: deleteScoringSession,
  name: "end the session scoring the target's upcoming game",
  run: (scope, target) =>
    deleteScoringSession(scope, target.upcomingGameId, target.scoringSessionId),
});

registerCommandCase(openScoringSession, harnessTx, {
  name: "open the target's upcoming game to score",
  input: (target) => ({ gameId: target.upcomingGameId, deviceId: 'harness-device' }),
});

registerCommandCase(renewScoringSession, harnessTx, {
  name: "renew the session scoring the target's upcoming game",
  input: (target) => ({ gameId: target.upcomingGameId, sessionId: target.scoringSessionId }),
});

registerCommandCase(takeOverScoring, harnessTx, {
  name: "take over scoring the target's upcoming game from its member",
  input: (target) => ({
    gameId: target.upcomingGameId,
    deviceId: 'harness-device',
    confirmed: true,
    expectedHolderSince: target.scoringSessionSince,
  }),
});

registerCommandCase(releaseScoringSession, harnessTx, {
  name: "release the session scoring the target's upcoming game",
  input: (target) => ({ gameId: target.upcomingGameId, sessionId: target.scoringSessionId }),
});

// Applying the tracker's commands (step 2.29) ----------------------------------------

// Set ids, so every run sends the same batch and its answers compare equal.
const harnessCommandIds = [
  '01900000-0000-7000-8000-00000000c291',
  '01900000-0000-7000-8000-00000000c292',
];

registerIsolationCase({
  subject: lockLiveGame,
  name: "lock the target's upcoming game",
  run: (scope, target) => lockLiveGame(scope, target.upcomingGameId),
});

registerIsolationCase({
  subject: findSavedGameState,
  name: "read the saved state of the target's final game",
  run: (scope, target) => findSavedGameState(scope, target.gameId),
});

registerIsolationCase({
  subject: listTakenCommands,
  name: "ask which of the target's final game's commands it has taken",
  run: (scope, target) => listTakenCommands(scope, target.gameId, target.gameCommandIds),
});

registerIsolationCase({
  subject: insertGameEvents,
  name: "add a third event to the target's final game",
  run: (scope, target) =>
    insertGameEvents(scope, [
      {
        gameId: target.gameId,
        seq: 3,
        commandId: harnessCommandIds[0] ?? '',
        type: 'pause',
        payload: {},
        tappedAt: harnessNow,
        accountId: scope.accountId ?? randomUUID(),
      },
    ]),
});

registerIsolationCase({
  subject: saveGameState,
  name: "write over the saved state of the target's final game",
  run: (scope, target) =>
    saveGameState(scope, target.gameId, 3, { version: 1, status: 'final', plays: [] }),
});

registerIsolationCase({
  subject: listGamePlayers,
  name: "list the players of the target's upcoming game",
  run: (scope, target) => listGamePlayers(scope, target.upcomingGameId),
});

registerIsolationCase({
  subject: saveGameLines,
  name: "write over the player's line in the target's final game",
  run: (scope, target) =>
    saveGameLines(
      scope,
      target.gameId,
      [
        {
          gameId: target.gameId,
          teamId: target.teamId,
          personId: target.personId,
          jerseyNumber: '23',
          played: true,
          secondsPlayed: 600,
          stats: { points: 4, fg2: 2 },
        },
      ],
      [],
    ),
});

registerIsolationCase({
  subject: saveGameLines,
  name: "take the player's line out of the target's final game",
  run: (scope, target) => saveGameLines(scope, target.gameId, [], [target.personId]),
});

// The scope's account takes the target's upcoming game over from its member first, so
// that in the target's own league the batch is taken: a line-up and a basket for the
// target's player (the away side). Anywhere else the takeover is refused, and the
// batch is sent with the member's session, which must reach nothing.
registerIsolationCase({
  subject: applyTrackerCommands,
  name: "score the target's upcoming game after taking it over",
  run: async (scope, target) => {
    const taken = await runAsApp(takeOverScoring, harnessTx, scope, {
      gameId: target.upcomingGameId,
      deviceId: 'harness-device',
      confirmed: true,
      expectedHolderSince: target.scoringSessionSince,
    }).catch((thrown: unknown) => {
      if (thrown instanceof CommandRefused) return undefined;
      throw thrown;
    });
    const reply = taken?.value as { status?: string; sessionId?: string } | undefined;
    const sessionId =
      reply?.status === 'held-by-you' && reply.sessionId !== undefined
        ? reply.sessionId
        : target.scoringSessionId;
    return runAsApp(applyTrackerCommands, harnessTx, scope, {
      gameId: target.upcomingGameId,
      protocolVersion: 1,
      sessionId,
      commands: [
        {
          commandId: harnessCommandIds[0],
          at: harnessNow - 2000,
          input: { type: 'lineup', side: 'away', playerIds: [target.personId] },
        },
        {
          commandId: harnessCommandIds[1],
          at: harnessNow - 1000,
          input: { type: 'score', side: 'away', playerId: target.personId, points: 2 },
        },
      ],
    });
  },
});
