// The teams module's store (core's TeamsStore), bound to one league scope.
import type { TeamsStore } from '@srleagues/core';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  findDivision,
  findSeasonProgramId,
  findTeam,
  insertTeam,
  setTeamBinned,
  updateTeam,
} from '../queries/index.ts';

export function teamsStore(scope: LeagueScope): TeamsStore {
  return {
    find: (teamId) => findTeam(scope, teamId),
    create: (team) => insertTeam(scope, team),
    update: (teamId, change, version) => updateTeam(scope, teamId, change, version),
    setBinned: (teamId, binned) => setTeamBinned(scope, teamId, binned),
    seasonProgramId: (seasonId) => findSeasonProgramId(scope, seasonId),
    findDivision: async (divisionId) => {
      const division = await findDivision(scope, divisionId);
      return division === undefined
        ? undefined
        : { seasonId: division.seasonId, binned: division.binned };
    },
  };
}
