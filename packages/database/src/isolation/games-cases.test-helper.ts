// The two-league harness's cases for games (step 2.23, T-65): every query in ../queries
// for them and every command of the same step. Imported by isolation-cases.test-helper.ts.
import {
  applyTrackerCommands,
  assignScorekeeper,
  cancelGame,
  endTrackedGame,
  getBoxScoreSheet,
  listMyGames,
  listPostponedGames as listPostponedGamesCommand,
  openScoringSession,
  postponeGame,
  readTrackerRosters,
  readTrackerState,
  recordFinalScore,
  recordForfeit,
  releaseScoringSession,
  renewScoringSession,
  reopenGame,
  setBoxScore,
  takeOverScoring,
  unassignScorekeeper,
} from '@srleagues/core';
import { seasonRulesPreset } from '@srleagues/contracts';
import type { JsonObject } from '../db/schema-types.ts';
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
  findLastEventSeq,
  findTablePlayer,
  insertTablePlayer,
  removeTablePlayer,
  changeTablePlayer,
  listRefusedAdds,
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
  subject: findLastEventSeq,
  name: "read the number of the target's final game's last event",
  run: (scope, target) => findLastEventSeq(scope, target.gameId),
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
async function scoreTargetUpcomingGame(scope: LeagueScope, target: LeagueRecords) {
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
}

registerIsolationCase({
  subject: applyTrackerCommands,
  name: "score the target's upcoming game after taking it over",
  run: scoreTargetUpcomingGame,
});

// The players at the scorer's table (record 058, T-261), in the same batch: after taking
// the target's upcoming game over, a player is added to its away team (the target's
// team) and the target's player is given a new number. In the target's own league both
// are taken; anywhere else the takeover is refused and nothing of the target changes.
registerIsolationCase({
  subject: applyTrackerCommands,
  name: "add a player to the target's team and renumber the target's player at its table",
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
    return runAsApp(applyTrackerCommands, harnessTx, scope, {
      gameId: target.upcomingGameId,
      protocolVersion: 2,
      sessionId:
        reply?.status === 'held-by-you' && reply.sessionId !== undefined
          ? reply.sessionId
          : target.scoringSessionId,
      commands: [
        {
          commandId: harnessCommandIds[0],
          at: harnessNow - 2000,
          input: {
            type: 'add-player',
            side: 'away',
            playerId: randomUUID(),
            jersey: '55',
            name: '',
          },
        },
        {
          commandId: harnessCommandIds[1],
          at: harnessNow - 1000,
          input: { type: 'change-player', side: 'away', playerId: target.personId, jersey: '56' },
        },
      ],
    });
  },
});

// The strongest takeover (review of step 2.117, item 10): the scope's account holds a
// game of its own league (it takes it over from its member), then adds a player whose
// device-made id is the target's person. It must be refused as taken, and the same
// answer must come whether or not the target's rows are there, so nothing tells the
// device that the id is anyone's: an id the platform made (not a random one) is
// refused without looking (table-players.ts). In the target's own league the takeover
// reaches it.
registerIsolationCase({
  subject: applyTrackerCommands,
  name: "add a player at the scope's own table whose id is the target's person",
  run: async (scope, target) => {
    const own = await transactionOf(scope)
      .selectFrom('scoring_sessions')
      .select('game_id')
      .where('league_id', '=', scope.leagueId)
      .limit(1)
      .executeTakeFirst();
    const gameId = own?.game_id ?? randomUUID();
    const holder = own === undefined ? undefined : await findScoringSession(scope, gameId);
    const taken = await runAsApp(takeOverScoring, harnessTx, scope, {
      gameId,
      deviceId: 'harness-device',
      confirmed: true,
      expectedHolderSince: holder?.since ?? 0,
    }).catch((thrown: unknown) => {
      if (thrown instanceof CommandRefused) return undefined;
      throw thrown;
    });
    const reply = taken?.value as { status?: string; sessionId?: string } | undefined;
    return runAsApp(applyTrackerCommands, harnessTx, scope, {
      gameId,
      protocolVersion: 2,
      sessionId: reply?.sessionId ?? randomUUID(),
      commands: [
        {
          commandId: harnessCommandIds[0],
          at: harnessNow - 1000,
          input: {
            type: 'add-player',
            side: 'away',
            playerId: target.personId,
            jersey: '9',
            name: '',
          },
        },
      ],
    }).catch((thrown: unknown) => {
      if (thrown instanceof CommandRefused) return 'refused';
      throw thrown;
    });
  },
});

// The table players' queries (record 058). A write that makes a new row uses a game
// and its home team of the scope's own league, so a refusal never names the target's
// ids; with none in sight it uses ids that are nowhere.
async function ownGameAndTeam(scope: LeagueScope) {
  const row = await transactionOf(scope)
    .selectFrom('games')
    .select(['id', 'home_team_id'])
    .where('league_id', '=', scope.leagueId)
    .limit(1)
    .executeTakeFirst();
  return { gameId: row?.id ?? randomUUID(), teamId: row?.home_team_id ?? randomUUID() };
}

/** The target's walk-up's person, as the scope's fence lets it be read: in another league, none. */
async function walkUpPersonOf(scope: LeagueScope, target: LeagueRecords) {
  const entry = await transactionOf(scope)
    .selectFrom('roster_entries')
    .select('person_id')
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', target.walkUpRosterEntryId)
    .executeTakeFirst();
  return entry?.person_id;
}

registerIsolationCase({
  subject: findTablePlayer,
  name: "find the target's player on the target's team for the scorer's table",
  run: (scope, target) => findTablePlayer(scope, target.teamId, target.personId),
});

registerIsolationCase({
  subject: insertTablePlayer,
  name: "add a number-only player at a game's table in the scope's league",
  run: async (scope) => {
    const own = await ownGameAndTeam(scope);
    return insertTablePlayer(scope, {
      personId: randomUUID(),
      teamId: own.teamId,
      gameId: own.gameId,
      jerseyNumber: '88',
      firstName: '',
      lastName: '',
      needsReview: true,
    });
  },
});

registerIsolationCase({
  subject: changeTablePlayer,
  name: "renumber and rename the target's walk-up player",
  run: async (scope, target) =>
    changeTablePlayer(
      scope,
      target.walkUpRosterEntryId,
      (await walkUpPersonOf(scope, target)) ?? randomUUID(),
      { jerseyNumber: '77', firstName: 'Renamed', lastName: 'Elsewhere' },
    ),
});

// An add refused at the target's upcoming game (review of step 2.117, L4), kept as one of
// its events: after taking the game over, an add with an id the platform made is refused
// and kept; then the refused adds are listed. Anywhere else the takeover is refused and
// there is nothing to list.
registerIsolationCase({
  subject: listRefusedAdds,
  name: "list the adds refused at the target's upcoming game",
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
    await runAsApp(applyTrackerCommands, harnessTx, scope, {
      gameId: target.upcomingGameId,
      protocolVersion: 2,
      sessionId: reply?.sessionId ?? target.scoringSessionId,
      commands: [
        {
          commandId: harnessCommandIds[0],
          at: harnessNow - 1000,
          input: {
            type: 'add-player',
            side: 'away',
            playerId: target.personId,
            jersey: '9',
            name: '',
          },
        },
      ],
    }).catch((thrown: unknown) => {
      if (thrown instanceof CommandRefused) return undefined;
      throw thrown;
    });
    return listRefusedAdds(scope, target.upcomingGameId);
  },
});

registerIsolationCase({
  subject: removeTablePlayer,
  name: "take the target's walk-up player off its team",
  run: async (scope, target) =>
    removeTablePlayer(
      scope,
      target.walkUpRosterEntryId,
      (await walkUpPersonOf(scope, target)) ?? randomUUID(),
      target.upcomingGameId,
      true,
    ),
});

// The engine's state for the scorekeeper's device (record 049, T-253): the target's
// final game has a saved state; the target's upcoming game is read once it is scored
// (in the run's own rolled-back transaction), so both a saved state and its sequence
// number are there to leak. Anywhere else the read is refused or finds no game.
registerCommandCase(readTrackerState, harnessTx, {
  name: "load the tracker's state of the target's final game",
  input: (target) => ({ gameId: target.gameId }),
});

// The rosters for the scorekeeper's device (record 054, T-258): the target's upcoming
// game has a player on a roster, with a name and a number to leak. Anywhere else the
// read is refused or finds no game.
registerCommandCase(readTrackerRosters, harnessTx, {
  name: "read the rosters of the target's upcoming game for the tracker",
  input: (target) => ({ gameId: target.upcomingGameId }),
});

registerIsolationCase({
  subject: readTrackerState,
  name: "load the tracker's state of the target's upcoming game once it is scored",
  run: async (scope, target) => {
    await scoreTargetUpcomingGame(scope, target).catch((thrown: unknown) => {
      if (thrown instanceof CommandRefused) return undefined;
      throw thrown;
    });
    return runAsApp(readTrackerState, harnessTx, scope, { gameId: target.upcomingGameId });
  },
});

// The season's rules reach the tracker (step 2.122, record 062): the target's season is
// given a foul limit of four and a stop clock (in the scope's own league only, so
// nowhere else does it change anything), its upcoming game is taken over, a line-up,
// the clock-mode switch and a foul are sent in the platform's command shape, and the
// state the device loads is read: in the target's league it carries the limit, the
// switch and the target's player. Anywhere else the takeover and the read are refused.
const rulesCommandIds = [
  '01900000-0000-7000-8000-00000000c2a1',
  '01900000-0000-7000-8000-00000000c2a2',
  '01900000-0000-7000-8000-00000000c2a3',
];

async function switchClockAtTargetUpcomingGame(scope: LeagueScope, target: LeagueRecords) {
  const rules = seasonRulesPreset('high-school');
  rules.fouls.playerFoulLimit = 4;
  await transactionOf(scope)
    .updateTable('seasons')
    .set({ rules: JSON.parse(JSON.stringify(rules)) as JsonObject })
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', target.seasonId)
    .execute();
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
  const at = (n: number) => harnessNow - 3000 + n * 1000;
  return runAsApp(applyTrackerCommands, harnessTx, scope, {
    gameId: target.upcomingGameId,
    protocolVersion: 2,
    sessionId: reply?.sessionId ?? target.scoringSessionId,
    commands: [
      {
        commandId: rulesCommandIds[0],
        at: at(0),
        input: { type: 'lineup', side: 'away', playerIds: [target.personId] },
      },
      {
        commandId: rulesCommandIds[1],
        at: at(1),
        input: { type: 'clock-mode', mode: 'running' },
      },
      {
        commandId: rulesCommandIds[2],
        at: at(2),
        input: { type: 'foul', side: 'away', playerId: target.personId },
      },
    ],
  });
}

registerIsolationCase({
  subject: applyTrackerCommands,
  name: "switch the clock mode at the target's upcoming game, under its season's foul limit",
  run: switchClockAtTargetUpcomingGame,
});

registerIsolationCase({
  subject: readTrackerState,
  name: "load the target's season's foul limit with the state of its upcoming game",
  run: async (scope, target) => {
    await switchClockAtTargetUpcomingGame(scope, target).catch((thrown: unknown) => {
      if (thrown instanceof CommandRefused) return undefined;
      throw thrown;
    });
    return runAsApp(readTrackerState, harnessTx, scope, { gameId: target.upcomingGameId });
  },
});

// Ending a tracked game (step 2.30): the upcoming game scored as above, then ended at
// the version it has now, read in the scope's own league (none elsewhere). In the
// target's league that settles its lines, makes it final and rebuilds its season's
// standings; anywhere else the end is refused.
registerIsolationCase({
  subject: endTrackedGame,
  name: "end the target's upcoming game once it is scored",
  run: async (scope, target) => {
    await scoreTargetUpcomingGame(scope, target);
    const row = await transactionOf(scope)
      .selectFrom('games')
      .select('version')
      .where('league_id', '=', scope.leagueId)
      .where('id', '=', target.upcomingGameId)
      .executeTakeFirst();
    return runAsApp(endTrackedGame, harnessTx, scope, {
      gameId: target.upcomingGameId,
      version: row?.version ?? 1,
    });
  },
});
