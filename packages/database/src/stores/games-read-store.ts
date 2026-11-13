// The games module's public reads (core's GamesReadStore), bound to one league scope.
import type { GamesReadStore } from '@srleagues/core';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  findGame,
  findGameCorrectedDate,
  findGameState,
  listGamePlayerLines,
  listGameTeams,
  listPeopleForDisplay,
} from '../queries/index.ts';

export function gamesReadStore(scope: LeagueScope): GamesReadStore {
  return {
    findGame: async (gameId) => {
      const game = await findGame(scope, gameId);
      return game === undefined
        ? undefined
        : {
            id: game.id,
            seasonId: game.seasonId,
            homeTeamId: game.homeTeamId,
            awayTeamId: game.awayTeamId,
            startsAt: game.startsAt,
            status: game.status,
            captureMode: game.captureMode,
            homeScore: game.homeScore,
            awayScore: game.awayScore,
            finalizedAt: game.finalizedAt,
            binned: game.binned,
          };
    },
    teams: (teamIds) => listGameTeams(scope, teamIds),
    state: (gameId) => findGameState(scope, gameId),
    lines: (gameId) => listGamePlayerLines(scope, gameId),
    people: (personIds) => listPeopleForDisplay(scope, personIds),
    correctedOn: (gameId) => findGameCorrectedDate(scope, gameId),
  };
}
