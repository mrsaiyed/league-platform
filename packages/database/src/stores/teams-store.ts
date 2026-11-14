// The teams module's store (core's TeamsStore), bound to one league scope.
import type { TeamsStore } from '@srleagues/core';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  findDivision,
  findPerson,
  findRosterEntry,
  findSeasonProgramId,
  findTeam,
  insertRosterEntry,
  insertTeam,
  listRoster,
  listSettingValues,
  updateRosterEntry,
  setTeamBinned,
  updateTeam,
} from '../queries/index.ts';

export function teamsStore(scope: LeagueScope): TeamsStore {
  return {
    // The league level only: no program or season is named, so only the league's row comes back.
    leagueSettingRows: (key) => listSettingValues(scope, key, {}),
    find: (teamId) => findTeam(scope, teamId),
    create: (team) => insertTeam(scope, team),
    update: (teamId, change, version) => updateTeam(scope, teamId, change, version),
    setBinned: async (teamId, binned) => {
      const done = await setTeamBinned(scope, teamId, binned);
      // Only bringing a team back can meet its lineage, and that is the bin store's.
      if (done === 'lineage-taken') throw new Error('teams_one_per_lineage');
      return done;
    },
    findPerson: async (personId) => {
      const person = await findPerson(scope, personId, false);
      return person === undefined ? undefined : { id: person.id, binned: person.binned };
    },
    findRosterEntry: (entryId) => findRosterEntry(scope, entryId),
    listRoster: (teamId) => listRoster(scope, teamId),
    addRosterEntry: (entry) => insertRosterEntry(scope, entry),
    updateRosterEntry: (entryId, change, version) =>
      updateRosterEntry(scope, entryId, change, version),
    seasonProgramId: (seasonId) => findSeasonProgramId(scope, seasonId),
    findDivision: async (divisionId) => {
      const division = await findDivision(scope, divisionId);
      return division === undefined
        ? undefined
        : { seasonId: division.seasonId, binned: division.binned };
    },
  };
}
