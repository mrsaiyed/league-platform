// The leagues module's store (core's LeaguesStore), bound to one league scope.
import type { LeaguesStore } from '@srleagues/core';
import type { LeagueScope } from '../db/transaction-scope.ts';
import { findCurrentLeague, updateLeagueName } from '../queries/index.ts';

export function leaguesStore(scope: LeagueScope): LeaguesStore {
  return {
    currentLeague: () => findCurrentLeague(scope),
    setName: (name, version) => updateLeagueName(scope, name, version),
  };
}
