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
  updateRosterEntry,
  setTeamBinned,
  updateTeam,
} from '../queries/index.ts';

export function teamsStore(scope: LeagueScope): TeamsStore {
  return {
    find: (teamId) => findTeam(scope, teamId),
    create: (team) => insertTeam(scope, team),
    update: (teamId, change, version) => updateTeam(scope, teamId, change, version),
    setBinned: (teamId, binned) => setTeamBinned(scope, teamId, binned),
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
