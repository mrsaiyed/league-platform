// The imports module's store (core's ImportsStore), bound to one league scope.
import type { ImportsStore } from '@srleagues/core';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  findImport,
  findSeasonProgramId,
  insertImport,
  listSeasonNames,
  updateImport,
} from '../queries/index.ts';

export function importsStore(scope: LeagueScope): ImportsStore {
  return {
    findSeason: async (seasonId) => {
      const programId = await findSeasonProgramId(scope, seasonId);
      return programId === undefined ? undefined : { programId };
    },
    seasonNames: (seasonId) => listSeasonNames(scope, seasonId),
    insert: (value) => insertImport(scope, value),
    find: (importId) => findImport(scope, importId),
    save: (importId, change, version) => updateImport(scope, importId, change, version),
  };
}
