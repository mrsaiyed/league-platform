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
  readGameSnapshot,
  readStandings,
  readStatisticsTable,
  readStatLeaders,
  readTeamRecords,
  readTeamsBeyondPublic,
} from '@srleagues/core';
import {
  findGameCorrectedDate,
  findGameState,
  listGamePlayerLines,
  listGameTeams,
  listPeopleForDisplay,
  listPlayerSeasonTotals,
  listPlayerTeamLinks,
  listResultsBeingCorrected,
  listSeasonDivisions,
  listSeasonStatKeys,
  listSeasonTeams,
  listStandingsAdjustments,
  listStandingsRows,
  listTeamStatTotals,
  listTeamTurnoverGames,
} from '../queries/index.ts';
import { sql } from 'kysely';
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
  arrange: openTargetSeason,
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
  subject: listTeamTurnoverGames,
  // Every league's seeded final game has a turnover charged to its away team
  // (two-leagues.test-helper.ts), so the target's is there in every run, not only the
  // control: only the query's own league filter keeps it out of the code-only run.
  name: "count the turnovers charged to a team in the target's season's final games",
  run: (scope, target) => listTeamTurnoverGames(scope, target.seasonId),
});
registerIsolationCase({
  subject: listPeopleForDisplay,
  name: "read the target's player's name for display",
  run: (scope, target) => listPeopleForDisplay(scope, [target.personId]),
});
registerIsolationCase({
  subject: listSeasonStatKeys,
  name: "read the target's season's statistics",
  arrange: openTargetSeason,
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
  // A correction of the game that changed its result, inside the target's own fence (fixed
  // id, dates and documents), so a query with its league filter taken out would read a
  // date from another league (the fence check, step 2.229 fix round).
  arrange: (inTarget, target) =>
    sql`insert into game_corrections
      (id, league_id, game_id, account_id, reason, before, after, at, created_at)
      values ('01900000-0000-7000-8000-00000000d229', ${inTarget.leagueId},
        ${target.gameId}, ${target.ownerId}, 'Harness correcting',
        ${JSON.stringify({ version: 1, status: 'forfeit', homeScore: 20, awayScore: 0 })}::jsonb,
        ${JSON.stringify({ version: 1, status: 'scheduled', homeScore: null, awayScore: null })}::jsonb,
        '2026-11-20T18:00:00Z', '2026-11-20T18:00:00Z')`.execute(transactionOf(inTarget)),
  run: (scope, target) => findGameCorrectedDate(scope, target.gameId),
});
// The target's final game reopened and not decided again: the game back to live, and the
// reopen's correction (before: the result as it stood, a forfeit 20 to 0 no row of the
// target holds) inside the target's own fence, so a query with its league filter taken out
// would answer with another league's result (step 2.159, the fence check). Its time is
// later than the seed's own correction of that game (stamped by the real clock), so it is
// the game's latest correction, the one a reopen's result is read from.
const reopenTargetGame = async (inTarget: LeagueScope, target: LeagueRecords) => {
  await transactionOf(inTarget)
    .updateTable('games')
    .set({ status: 'live', finalized_at: null })
    .where('league_id', '=', inTarget.leagueId)
    .where('id', '=', target.gameId)
    .execute();
  await sql`insert into game_corrections
      (id, league_id, game_id, account_id, reason, before, after, at, created_at)
      values ('01900000-0000-7000-8000-00000000d159', ${inTarget.leagueId},
        ${target.gameId}, ${target.ownerId}, 'Harness reopening',
        ${JSON.stringify({ version: 1, status: 'forfeit', homeScore: 20, awayScore: 0 })}::jsonb,
        ${JSON.stringify({ version: 1, status: 'live', homeScore: null, awayScore: null })}::jsonb,
        '2030-01-01T18:00:00Z', '2030-01-01T18:00:00Z')`.execute(transactionOf(inTarget));
};
registerIsolationCase({
  subject: gamesReadStore,
  name: "read the result the target's reopened game stood at",
  arrange: reopenTargetGame,
  run: (scope, target) => gamesReadStore(scope).resultBeingCorrected(target.gameId),
});
registerIsolationCase({
  subject: listResultsBeingCorrected,
  name: "list the results the target's reopened games stood at",
  arrange: reopenTargetGame,
  run: (scope, target) => listResultsBeingCorrected(scope, [target.gameId]),
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
  arrange: openTargetSeason,
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    return readStandings(standingsReadStore(scope), { seasonId: target.seasonId });
  },
});
registerIsolationCase({
  subject: standingsReadStore,
  name: "list the target's season's decided games for the standings' notes",
  arrange: openTargetSeason,
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    return standingsReadStore(scope).decidedGames(target.seasonId);
  },
});
registerIsolationCase({
  subject: standingsReadStore,
  name: "read the target's season's team records",
  arrange: openTargetSeason,
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    return readTeamRecords(standingsReadStore(scope), { seasonId: target.seasonId });
  },
});
registerIsolationCase({
  subject: standingsReadStore,
  name: "read the target's season's statistics as a visitor",
  arrange: openTargetSeason,
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
  arrange: openTargetSeason,
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    return readStatLeaders(
      standingsReadStore(scope),
      { seasonId: target.seasonId, measure: 'points' },
      viewing(target.leagueId),
    );
  },
});
// The signed-in request after a public page (step 2.46, T-287), as a viewer claiming to be
// the target league's admin and the target team's coach: the fence still shows nothing.
const asTargetStaff = (target: LeagueRecords) => ({
  ...viewing(target.leagueId),
  viewer: { leagueId: target.leagueId, leagueAdmin: true, staffOfTeamIds: [target.teamId] },
});

const limitTargetTeamToStaff = (scope: LeagueScope, target: LeagueRecords) =>
  transactionOf(scope)
    .updateTable('teams')
    .set({ stats_visibility: 'staff' })
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', target.teamId)
    .execute();

registerIsolationCase({
  subject: standingsReadStore,
  name: "find the target's season's teams a staff viewer sees more of",
  arrange: async (scope, target) => {
    await openTargetSeason(scope, target);
    await limitTargetTeamToStaff(scope, target);
  },
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    await limitTargetTeamToStaff(scope, target);
    return readTeamsBeyondPublic(
      standingsReadStore(scope),
      { seasonId: target.seasonId },
      asTargetStaff(target),
    );
  },
});
registerIsolationCase({
  subject: standingsReadStore,
  name: "read the target's season's statistics as the target's staff",
  arrange: openTargetSeason,
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    return readStatisticsTable(standingsReadStore(scope), {
      seasonId: target.seasonId,
      viewing: asTargetStaff(target),
    });
  },
});
registerIsolationCase({
  subject: gamesReadStore,
  name: "read the target's final game's page as the target's staff",
  arrange: openTargetSeason,
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    return readGamePage(gamesReadStore(scope), { gameId: target.gameId }, asTargetStaff(target));
  },
});
registerIsolationCase({
  subject: gamesReadStore,
  name: "read the target's final game's page as a visitor",
  arrange: openTargetSeason,
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    return readGamePage(gamesReadStore(scope), { gameId: target.gameId }, viewing(target.leagueId));
  },
});
registerIsolationCase({
  subject: gamesReadStore,
  name: "read the target's game's live snapshot as a visitor",
  arrange: openTargetSeason,
  run: async (scope, target) => {
    await openTargetSeason(scope, target);
    return readGameSnapshot(
      gamesReadStore(scope),
      { gameId: target.gameId },
      viewing(target.leagueId),
      Date.parse('2026-12-06T18:10:00Z'),
    );
  },
});
