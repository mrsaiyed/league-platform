// The two-league harness's cases for standings (step 2.24, T-65): every query in
// ../queries for them, the rebuild command, and the handlers that rebuild a season
// when a game is decided or reopened. The season's results the games module gives
// them have their cases in games-cases.test-helper.ts. Imported by
// isolation-cases.test-helper.ts.
import {
  addAdjustment,
  gameFinalized,
  gameReopened,
  rebuildOnGameFinalized,
  rebuildOnGameReopened,
  rebuildStandings,
  removeAdjustment,
} from '@srleagues/core';
import type { PlayerSeasonTotals, StandingsRow } from '@srleagues/sports';
import {
  binStandingsAdjustment,
  insertStandingsAdjustment,
  listStandingsAdjustments,
  listTableTeams,
  replaceSeasonPlayerTotals,
  replaceStandingsRows,
} from '../queries/index.ts';
import {
  harnessTx,
  registerCommandCase,
  registerHandlerCase,
} from './command-cases.test-helper.ts';
import { registerIsolationCase } from './isolation-registry.test-helper.ts';
import type { LeagueRecords } from './two-leagues.test-helper.ts';

// Queries -----------------------------------------------------------------------------

registerIsolationCase({
  subject: listTableTeams,
  name: "list the target's season's teams",
  run: (scope, target) => listTableTeams(scope, target.seasonId),
});

registerIsolationCase({
  subject: listStandingsAdjustments,
  name: "list the target's season's adjustments",
  run: (scope, target) => listStandingsAdjustments(scope, target.seasonId),
});

registerIsolationCase({
  subject: insertStandingsAdjustment,
  name: "add an adjustment for the target's team",
  run: (scope, target) =>
    insertStandingsAdjustment(scope, target.seasonId, {
      teamId: target.teamId,
      wins: 1,
      losses: 0,
      ties: 0,
      points: 0,
      reason: 'Won by ruling',
      accountId: scope.accountId ?? '',
    }),
});

registerIsolationCase({
  subject: binStandingsAdjustment,
  name: "bin the target's adjustment",
  run: (scope, target) =>
    binStandingsAdjustment(scope, target.seasonId, target.standingsAdjustmentId),
});

/** One standings row for the target's team, in its division, alone in its table. */
const rowFor = (target: LeagueRecords): StandingsRow => ({
  teamId: target.teamId,
  divisionId: target.divisionId,
  rank: 1,
  seed: 1,
  gamesPlayed: 2,
  wins: 2,
  losses: 0,
  ties: 0,
  pointsFor: 100,
  pointsAgainst: 90,
  pointDifference: 10,
  winPercentage: 1,
  points: null,
  streak: { result: 'won', length: 2 },
  decidedBy: null,
  adjustments: [],
});

registerIsolationCase({
  subject: replaceStandingsRows,
  name: "make the target's season's standings one row for the target's team",
  run: (scope, target) => replaceStandingsRows(scope, target.seasonId, [rowFor(target)]),
});

registerIsolationCase({
  subject: replaceStandingsRows,
  name: "empty the target's season's standings",
  run: (scope, target) => replaceStandingsRows(scope, target.seasonId, []),
});

const totalsFor = (target: LeagueRecords): PlayerSeasonTotals => ({
  personId: target.personId,
  teamIds: [target.teamId],
  gamesPlayed: 2,
  seconds: { total: 2400, gamesRecorded: 2, average: 1200 },
  stats: { points: { total: 9, gamesRecorded: 2, average: 4.5 } },
});

registerIsolationCase({
  subject: replaceSeasonPlayerTotals,
  name: "make the target's season's totals one row for the target's player",
  run: (scope, target) => replaceSeasonPlayerTotals(scope, target.seasonId, [totalsFor(target)]),
});

registerIsolationCase({
  subject: replaceSeasonPlayerTotals,
  name: "empty the target's season's totals",
  run: (scope, target) => replaceSeasonPlayerTotals(scope, target.seasonId, []),
});

// Commands ----------------------------------------------------------------------------

registerCommandCase(rebuildStandings, harnessTx, {
  name: "rebuild the target's season's standings and totals",
  input: (target) => ({ seasonId: target.seasonId }),
});

registerCommandCase(addAdjustment, harnessTx, {
  name: "add an adjustment for the target's team",
  input: (target) => ({
    seasonId: target.seasonId,
    teamId: target.teamId,
    wins: 1,
    reason: 'Won by ruling',
  }),
});

registerCommandCase(removeAdjustment, harnessTx, {
  name: "remove the target's adjustment",
  input: (target) => ({
    seasonId: target.seasonId,
    adjustmentId: target.standingsAdjustmentId,
  }),
});

// Event handlers ----------------------------------------------------------------------

registerHandlerCase(rebuildOnGameFinalized, {
  name: "rebuild after the target's game was decided",
  event: (scope, target) => ({
    type: gameFinalized,
    leagueId: scope.leagueId,
    gameId: target.gameId,
    seasonId: target.seasonId,
  }),
});

registerHandlerCase(rebuildOnGameReopened, {
  name: "rebuild after the target's game was reopened",
  event: (scope, target) => ({
    type: gameReopened,
    leagueId: scope.leagueId,
    gameId: target.gameId,
    seasonId: target.seasonId,
  }),
});
