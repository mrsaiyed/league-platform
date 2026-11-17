// The games module's public reads (core's GamesReadStore, and the snapshot's
// GameSnapshotStore beside it), bound to one league scope.
import type { GameSnapshotStore } from '@srleagues/core';
import { publicSeasonStatuses } from './standings-read-store.ts';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  findGame,
  findSeason,
  findGameCorrectedDate,
  findGameState,
  findSavedGameState,
  listGamePlayerLines,
  listGameTeams,
  listPeopleForDisplay,
  listSeasonStatKeys,
} from '../queries/index.ts';

export function gamesReadStore(scope: LeagueScope): GameSnapshotStore {
  return {
    findGame: async (gameId) => {
      const game = await findGame(scope, gameId);
      if (game === undefined) return undefined;
      // A game of a season still being set up (or retired) is not there at all.
      const season = await findSeason(scope, game.seasonId);
      if (season === undefined || !publicSeasonStatuses.includes(season.status)) return undefined;
      // The statistics the season names, as the statistics page reads them (step 2.196).
      const seasonStatKeys = (await listSeasonStatKeys(scope, season.id)) ?? [];
      return {
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
        rules: game.format ?? season.rules,
        seasonStatKeys,
      };
    },
    teams: (teamIds) => listGameTeams(scope, teamIds),
    state: (gameId) => findGameState(scope, gameId),
    savedState: (gameId) => findSavedGameState(scope, gameId),
    lines: (gameId) => listGamePlayerLines(scope, gameId),
    people: (personIds) => listPeopleForDisplay(scope, personIds),
    correctedOn: (gameId) => findGameCorrectedDate(scope, gameId),
  };
}
