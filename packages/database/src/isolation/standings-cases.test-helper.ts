// The two-league harness's cases for standings (step 2.24, T-65): every query in
// ../queries for them, the rebuild command, and the handlers that rebuild a season
// when a game is decided or reopened. The season's results the games module gives
// them have their cases in games-cases.test-helper.ts. Imported by
// isolation-cases.test-helper.ts.
import {
  addAdjustment,
  awardGame,
  clearLeagueOnSettingChanged,
  clearLeagueOnStatusChanged,
  clearPagesOnGameFinalized,
  clearPagesOnGameReopened,
  overturnResult,
  gameFinalized,
  gameReopened,
  leagueSettingChanged,
  leagueStatusChanged,
  listAdjustments,
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
  level: null,
  adjustments: [],
});

registerIsolationCase({
  subject: replaceStandingsRows,
  name: "make the target's season's standings one row for the target's team",
  run: (scope, target) => replaceStandingsRows(scope, target.seasonId, [rowFor(target)]),
});

registerIsolationCase({
  subject: replaceStandingsRows,
  name: "make the target's team level with another, with how they were ordered (0022)",
  run: (scope, target) =>
    replaceStandingsRows(scope, target.seasonId, [
      {
        ...rowFor(target),
        decidedBy: 'head-to-head',
        level: {
          teamIds: [target.teamId, target.teamId.replace(/.$/, '0')],
          steps: [
            {
              tiebreaker: 'head-to-head',
              applied: true,
              teams: [
                {
                  teamId: target.teamId,
                  place: 1,
                  value: null,
                  record: { wins: 1, losses: 0, ties: 0 },
                },
                {
                  teamId: target.teamId.replace(/.$/, '0'),
                  place: 2,
                  value: null,
                  record: { wins: 0, losses: 1, ties: 0 },
                },
              ],
            },
          ],
        },
      },
    ]),
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

registerCommandCase(overturnResult, harnessTx, {
  name: "overturn the result of the target's game",
  input: (target) => ({ seasonId: target.seasonId, gameId: target.gameId, reason: 'Ruling' }),
});

registerCommandCase(awardGame, harnessTx, {
  name: "award the target's team a game not played",
  input: (target) => ({
    seasonId: target.seasonId,
    winnerTeamId: target.teamId,
    loserTeamId: target.opponentId,
    reason: 'Not played: awarded',
  }),
});

registerCommandCase(listAdjustments, harnessTx, {
  name: "list the target's season's adjustments",
  input: (target) => ({ seasonId: target.seasonId }),
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

// The page cache's handlers (step 2.26) read no rows: they copy the event's league and
// ids into a `cache.clear` job of the scope's own league. The event names made-up ids, so
// all that could cross is the league, and in the target's own scope the job is the target's.
const madeUpSeasonId = '01900000-0000-7000-8000-00000000e0c1';
const madeUpGameId = '01900000-0000-7000-8000-00000000e0f1';

registerHandlerCase(clearPagesOnGameFinalized, {
  name: 'clear the pages of a decided game',
  group: 'page cache',
  event: (scope) => ({
    type: gameFinalized,
    leagueId: scope.leagueId,
    gameId: madeUpGameId,
    seasonId: madeUpSeasonId,
  }),
});

registerHandlerCase(clearPagesOnGameReopened, {
  name: 'clear the pages of a reopened game',
  group: 'page cache',
  event: (scope) => ({
    type: gameReopened,
    leagueId: scope.leagueId,
    gameId: madeUpGameId,
    seasonId: madeUpSeasonId,
  }),
});

registerHandlerCase(clearLeagueOnStatusChanged, {
  name: "clear the whole league's pages after its status changed",
  event: (scope) => ({ type: leagueStatusChanged, leagueId: scope.leagueId }),
});

registerHandlerCase(clearLeagueOnSettingChanged, {
  name: "clear the whole league's pages after how names show changed",
  event: (scope) => ({
    type: leagueSettingChanged,
    leagueId: scope.leagueId,
    key: 'privacy.publicNames',
  }),
});
