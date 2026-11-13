// The leagues module's divisions store (core's DivisionsStore), bound to one league scope.
import type { DivisionsStore } from '@srleagues/core';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  findDivision,
  hasLiveSubdivisions,
  insertDivision,
  listDivisions,
  setDivisionBinned,
  updateDivision,
} from '../queries/index.ts';

export function divisionsStore(scope: LeagueScope): DivisionsStore {
  return {
    find: (divisionId) => findDivision(scope, divisionId),
    list: (seasonId) => listDivisions(scope, seasonId),
    create: (division) => insertDivision(scope, division),
    update: (divisionId, change, version) => updateDivision(scope, divisionId, change, version),
    setBinned: (divisionId, binned) => setDivisionBinned(scope, divisionId, binned),
    hasLiveSubdivisions: (divisionId) => hasLiveSubdivisions(scope, divisionId),
  };
}
