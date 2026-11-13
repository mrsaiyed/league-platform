// The standings module's store (core's StandingsStore), bound to one league scope.
import type { StandingsStore } from '@srleagues/core';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  listStandingsAdjustments,
  listTableTeams,
  lockSeasonStandings,
  replaceSeasonPlayerTotals,
  replaceStandingsRows,
} from '../queries/index.ts';

export function standingsStore(scope: LeagueScope): StandingsStore {
  return {
    lockSeason: (seasonId) => lockSeasonStandings(scope, seasonId),
    listTeams: (seasonId) => listTableTeams(scope, seasonId),
    listAdjustments: (seasonId) => listStandingsAdjustments(scope, seasonId),
    replaceRows: (seasonId, rows) => replaceStandingsRows(scope, seasonId, rows),
    replaceTotals: (seasonId, totals) => replaceSeasonPlayerTotals(scope, seasonId, totals),
  };
}
