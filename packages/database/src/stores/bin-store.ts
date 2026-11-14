// The leagues module's bin store (core's BinStore), bound to one league scope.
import type { BinStore } from '@srleagues/core';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  findDivision,
  findGame,
  findPerson,
  findSeasonProgramId,
  findTeam,
  hasBinnedGamePart,
  listBinned,
  purgeBinned,
  restoreBinnedGame,
  restoreBinnedPerson,
  setTeamBinned,
} from '../queries/index.ts';

export function binStore(scope: LeagueScope): BinStore {
  return {
    list: () => listBinned(scope),
    seasonProgramId: (seasonId) => findSeasonProgramId(scope, seasonId),
    findTeam: async (teamId) => {
      const team = await findTeam(scope, teamId);
      if (team === undefined) return undefined;
      const division =
        team.divisionId === null ? undefined : await findDivision(scope, team.divisionId);
      return {
        seasonId: team.seasonId,
        binned: team.binned,
        divisionInBin: division?.binned === true,
      };
    },
    findPerson: async (personId) => {
      const person = await findPerson(scope, personId, false);
      return person === undefined ? undefined : { binned: person.binned };
    },
    findGame: async (gameId) => {
      const game = await findGame(scope, gameId);
      if (game === undefined) return undefined;
      return {
        seasonId: game.seasonId,
        binned: game.binned,
        status: game.status,
        partInBin: await hasBinnedGamePart(scope, gameId),
      };
    },
    restoreTeam: async (teamId) => {
      const restored = await setTeamBinned(scope, teamId, false);
      if (restored === 'slug-taken') return 'short-name-taken';
      return restored;
    },
    restorePerson: (personId) => restoreBinnedPerson(scope, personId),
    restoreGame: (gameId) => restoreBinnedGame(scope, gameId),
    purge: (cutoff) => purgeBinned(scope, cutoff),
  };
}
