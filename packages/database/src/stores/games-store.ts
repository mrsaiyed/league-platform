// The games module's store (core's GamesStore), bound to one league scope.
import type { GamesStore } from '@srleagues/core';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  findGame,
  findSeason,
  insertGameCorrection,
  listPostponedGames,
  updateGameResult,
} from '../queries/index.ts';

export function gamesStore(scope: LeagueScope): GamesStore {
  return {
    find: (gameId) => findGame(scope, gameId),
    setResult: (gameId, change, version) => updateGameResult(scope, gameId, change, version),
    addCorrection: (correction) => insertGameCorrection(scope, correction),
    listPostponed: (seasonId) => listPostponedGames(scope, seasonId),
    findSeason: async (seasonId) => {
      const season = await findSeason(scope, seasonId);
      return season === undefined
        ? undefined
        : { programId: season.programId, rules: season.rules };
    },
  };
}
