// The two-league harness's cases for the public standings, statistics and game reads
// (step 2.40, T-65): every query behind them, and the reads themselves run as a visitor.
// The seeded season is still being set up, which a public read may not show, so the cases
// that reach a season or a game first open the scope's own season to the public (inside
// the run's rolled-back transaction), as a published season would be.
// Imported by isolation-cases.test-helper.ts.
import {
  defaultNamePolicy,
  publicViewer,
  readGamePage,
  readStandings,
  readStatisticsTable,
  readStatLeaders,
  readTeamRecords,
} from '@srleagues/core';
import {
  findGameCorrectedDate,
  findGameState,
  listGamePlayerLines,
  listGameTeams,
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
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { gamesReadStore, standingsReadStore } from '../stores/index.ts';
import type { LeagueRecords } from './two-leagues.test-helper.ts';
import { registerIsolationCase } from './isolation-registry.test-helper.ts';

async function openTargetSeason(scope: LeagueScope, target: LeagueRecords) {
  await transactionOf(scope)
    .updateTable('seasons')
    .set({ status: 'active' })
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', target.seasonId)
    .execute();
}

registerIsolationCase({
  subject: listSeasonTeams,
  name: "list the target's season's teams",
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    return listSeasonTeams(scope, target.seasonId);
  },
});
registerIsolationCase({
  subject: listSeasonDivisions,
  name: "list the target's season's divisions",
  run: (scope, target) => listSeasonDivisions(scope, target.seasonId),
});
registerIsolationCase({
  subject: listStandingsRows,
  name: "list the target's season's standings rows",
  run: (scope, target) => listStandingsRows(scope, target.seasonId),
});
registerIsolationCase({
  subject: listStandingsAdjustments,
  name: "list the target's season's standings adjustments",
  run: (scope, target) => listStandingsAdjustments(scope, target.seasonId),
});
registerIsolationCase({
  subject: listPlayerSeasonTotals,
  name: "list the target's season's player totals",
  run: (scope, target) => listPlayerSeasonTotals(scope, target.seasonId),
});
registerIsolationCase({
  subject: listPlayerTeamLinks,
  name: "list the target's season's player and team links",
  run: (scope, target) => listPlayerTeamLinks(scope, target.seasonId),
});
registerIsolationCase({
  subject: listTeamStatTotals,
  name: "total the target's season's team statistics",
  run: (scope, target) => listTeamStatTotals(scope, target.seasonId),
});
registerIsolationCase({
  subject: listPeopleForDisplay,
  name: "read the target's player's name for display",
  run: (scope, target) => listPeopleForDisplay(scope, [target.personId]),
});
registerIsolationCase({
  subject: listSeasonStatKeys,
  name: "read the target's season's statistics",
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    return listSeasonStatKeys(scope, target.seasonId);
  },
});
registerIsolationCase({
  subject: findGameState,
  name: "find the target's final game's saved state",
  run: (scope, target) => findGameState(scope, target.gameId),
});
registerIsolationCase({
  subject: listGamePlayerLines,
  name: "list the target's final game's player lines",
  run: (scope, target) => listGamePlayerLines(scope, target.gameId),
});
registerIsolationCase({
  subject: findGameCorrectedDate,
  name: "find the date the target's final game was corrected",
  run: (scope, target) => findGameCorrectedDate(scope, target.gameId),
});
registerIsolationCase({
  subject: listGameTeams,
  name: "list the teams of the target's final game",
  run: (scope, target) => listGameTeams(scope, [target.teamId, target.opponentId]),
});

// The reads themselves, as a visitor to the target's league.
const viewing = (leagueId: string) => ({
  leagueId,
  viewer: publicViewer(leagueId),
  audience: 'adult' as const,
  policy: defaultNamePolicy,
});

registerIsolationCase({
  subject: standingsReadStore,
  name: "read the target's season's standings",
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    return readStandings(standingsReadStore(scope), { seasonId: target.seasonId });
  },
});
registerIsolationCase({
  subject: standingsReadStore,
  name: "read the target's season's team records",
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    return readTeamRecords(standingsReadStore(scope), { seasonId: target.seasonId });
  },
});
registerIsolationCase({
  subject: standingsReadStore,
  name: "read the target's season's statistics as a visitor",
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    return readStatisticsTable(standingsReadStore(scope), {
      seasonId: target.seasonId,
      viewing: viewing(target.leagueId),
    });
  },
});
registerIsolationCase({
  subject: standingsReadStore,
  name: "read the target's season's leaders as a visitor",
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    return readStatLeaders(
      standingsReadStore(scope),
      { seasonId: target.seasonId, measure: 'points' },
      viewing(target.leagueId),
    );
  },
});
registerIsolationCase({
  subject: gamesReadStore,
  name: "read the target's final game's page as a visitor",
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    return readGamePage(gamesReadStore(scope), { gameId: target.gameId }, viewing(target.leagueId));
  },
});
