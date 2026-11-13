// The standings module's public reads (core's StandingsReadStore), bound to one league scope.
import type { StandingsReadStore } from '@srleagues/core';
import type { LeagueScope } from '../db/transaction-scope.ts';
import {
  findSeason,
  listDecidedGameLines,
  listDecidedGames,
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

/** The seasons whose standings, statistics and games the public may read. */
export const publicSeasonStatuses: readonly string[] = ['active', 'completed'];

export function standingsReadStore(scope: LeagueScope): StandingsReadStore {
  return {
    findSeason: async (seasonId) => {
      const season = await findSeason(scope, seasonId);
      // A season still being set up (or retired) is not there at all, like in 2.39.
      return season === undefined || !publicSeasonStatuses.includes(season.status)
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
    decidedGamesOf: async (seasonId, personIds) => {
      const wanted = new Set(personIds);
      const [games, lines] = await Promise.all([
        listDecidedGames(scope, seasonId),
        listDecidedGameLines(scope, seasonId),
      ]);
      return games.map((game) => ({
        gameId: game.id,
        status: game.status,
        captureMode: game.captureMode,
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
        lines: lines.filter((line) => line.gameId === game.id && wanted.has(line.personId)),
      }));
    },
    teamStatTotals: (seasonId) => listTeamStatTotals(scope, seasonId),
    people: (personIds) => listPeopleForDisplay(scope, personIds),
  };
}
