// The games module's store (core's GamesStore), bound to one league scope.
import type { GamesStore } from '@srleagues/core';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  findPerson,
  findTeam,
  deleteGameAssignment,
  findGame,
  findGameGivenFormat,
  findSeason,
  findStatusBeforeCancelled,
  gameHasPlays,
  hasBinnedGamePart,
  insertGameAssignment,
  insertGameCorrection,
  listGameCorrectionsNewestFirst,
  isGameAssigned,
  listDecidedGameLines,
  listDecidedGames,
  listGameClashes,
  listGameLines,
  listGameRoster,
  listEarlierRound,
  listEarlierRounds,
  listGamesByIds,
  listGamesInWindow,
  listGamesNeedingResult,
  listPostponedGames,
  listSeasonAssignments,
  listSettingValues,
  lockLiveGame,
  replaceGameLines,
  updateGameNotStarted,
  updateGameGivenFormat,
  updateGameResult,
} from '../queries/index.ts';

export function gamesStore(scope: LeagueScope): GamesStore {
  return {
    find: (gameId) => findGame(scope, gameId),
    // The tracker's own lock (scoring-sessions-store.ts), so the two never pass each other.
    lockGame: (gameId) => lockLiveGame(scope, gameId),
    setResult: (gameId, change, version) => updateGameResult(scope, gameId, change, version),
    markNotStarted: (gameId, version) => updateGameNotStarted(scope, gameId, version),
    givenFormat: (gameId) => findGameGivenFormat(scope, gameId),
    setGivenFormat: (gameId, format, version) =>
      updateGameGivenFormat(scope, gameId, format, version),
    addCorrection: (correction) => insertGameCorrection(scope, correction),
    correctionsNewestFirst: (gameId) => listGameCorrectionsNewestFirst(scope, gameId),
    listPostponed: (seasonId) => listPostponedGames(scope, seasonId),
    statusBeforeCancelled: (gameId) => findStatusBeforeCancelled(scope, gameId),
    partInBin: (gameId) => hasBinnedGamePart(scope, gameId),
    clashesOf: (gameId) => listGameClashes(scope, gameId),
    listDecided: (seasonId) => listDecidedGames(scope, seasonId),
    listDecidedLines: (seasonId) => listDecidedGameLines(scope, seasonId),
    listLines: (gameId) => listGameLines(scope, gameId),
    replaceLines: (gameId, lines) => replaceGameLines(scope, gameId, lines),
    listRoster: (gameId) => listGameRoster(scope, gameId),
    // Both still in the league, one of them in the bin: a restore brings the player back.
    inBin: async ({ teamId, personId }) => {
      const [person, team] = [
        await findPerson(scope, personId, false),
        await findTeam(scope, teamId),
      ];
      return person !== undefined && team !== undefined && (person.binned || team.binned);
    },
    hasPlays: (gameId) => gameHasPlays(scope, gameId),
    findSeason: async (seasonId) => {
      const season = await findSeason(scope, seasonId);
      return season === undefined
        ? undefined
        : { programId: season.programId, rules: season.rules };
    },
    // The league level only: no program or season is named, so only the league's row comes back.
    leagueSettingRows: (key) => listSettingValues(scope, key, {}),
    listSeasonAssignments: (seasonId) => listSeasonAssignments(scope, seasonId),
    isAssigned: (gameId, accountId) => isGameAssigned(scope, gameId, accountId),
    assign: (gameId, accountId) => insertGameAssignment(scope, gameId, accountId),
    unassign: (gameId, accountId) => deleteGameAssignment(scope, gameId, accountId),
    listWindow: (accountId, days) => listGamesInWindow(scope, accountId, days),
    listByIds: (accountId, gameIds) => listGamesByIds(scope, accountId, gameIds),
    listNeedingResult: (accountId, reach, limit) =>
      listGamesNeedingResult(scope, accountId, reach, limit),
    listEarlierRounds: (accountId, reach, limit) =>
      listEarlierRounds(scope, accountId, reach, limit),
    listEarlierRound: (accountId, reach, round, limit) =>
      listEarlierRound(scope, accountId, reach, round, limit),
  };
}
