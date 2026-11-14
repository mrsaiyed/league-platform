// The standings module's store (core's StandingsStore), bound to one league scope.
import type { StandingsStore } from '@srleagues/core';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  binStandingsAdjustment,
  insertStandingsAdjustment,
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
    addAdjustment: (seasonId, adjustment) => insertStandingsAdjustment(scope, seasonId, adjustment),
    binAdjustment: (seasonId, adjustmentId) =>
      binStandingsAdjustment(scope, seasonId, adjustmentId),
    replaceRows: (seasonId, rows) => replaceStandingsRows(scope, seasonId, rows),
    replaceTotals: (seasonId, totals) => replaceSeasonPlayerTotals(scope, seasonId, totals),
  };
}
