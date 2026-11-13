// The standings module's public reads (core's StandingsReadStore), bound to one league scope.
import type { StandingsReadStore } from '@srleagues/core';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  findSeason,
  listPeopleForDisplay,
  listPlayerSeasonTotals,
  listPlayerTeamLinks,
  listSeasonDivisions,
  listSeasonStatKeys,
  listSeasonTeams,
  listStandingsAdjustments,
  listStandingsRows,
  listTeamStatTotals,
} from '../queries/index.ts';

export function standingsReadStore(scope: LeagueScope): StandingsReadStore {
  return {
    findSeason: async (seasonId) => {
      const season = await findSeason(scope, seasonId);
      return season === undefined
        ? undefined
        : { id: season.id, name: season.name, rules: season.rules };
    },
    seasonStatKeys: (seasonId) => listSeasonStatKeys(scope, seasonId),
    teams: (seasonId) => listSeasonTeams(scope, seasonId),
    divisions: (seasonId) => listSeasonDivisions(scope, seasonId),
    standingsRows: (seasonId) => listStandingsRows(scope, seasonId),
    adjustments: (seasonId) => listStandingsAdjustments(scope, seasonId),
    playerTotals: (seasonId) => listPlayerSeasonTotals(scope, seasonId),
    playerTeams: (seasonId) => listPlayerTeamLinks(scope, seasonId),
    teamStatTotals: (seasonId) => listTeamStatTotals(scope, seasonId),
    people: (personIds) => listPeopleForDisplay(scope, personIds),
  };
}
