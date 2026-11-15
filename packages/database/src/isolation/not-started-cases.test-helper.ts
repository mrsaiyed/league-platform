// The two-league harness's cases for marking a game not started (step 2.121, S-40):
// the target's upcoming game is scored first (a lineup and a basket, as in
// games-cases.test-helper.ts), in the run's own rolled-back transaction, so in the
// target's league there is a live game with plays, lines and a session to clear.
// Anywhere else the scoring is refused and there is nothing of the target's to reach.
import { markNotStarted } from '@srleagues/core';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { updateGameNotStarted } from '../queries/index.ts';
import { CommandRefused, harnessTx, runAsApp } from './command-cases.test-helper.ts';
import { scoreTargetUpcomingGame } from './games-cases.test-helper.ts';
import { registerIsolationCase } from './isolation-registry.test-helper.ts';
import type { LeagueRecords } from './two-leagues.test-helper.ts';

/** The target's upcoming game scored, then its version and sequence as read in the scope. */
async function scoredTargetGame(scope: LeagueScope, target: LeagueRecords) {
  await scoreTargetUpcomingGame(scope, target).catch((thrown: unknown) => {
    if (thrown instanceof CommandRefused) return undefined;
    throw thrown;
  });
  const game = await transactionOf(scope)
    .selectFrom('games')
    .select('version')
    .where('league_id', '=', scope.leagueId)
    .where('id', '=', target.upcomingGameId)
    .executeTakeFirst();
  const state = await transactionOf(scope)
    .selectFrom('game_states')
    .select('seq')
    .where('league_id', '=', scope.leagueId)
    .where('game_id', '=', target.upcomingGameId)
    .executeTakeFirst();
  return { version: game?.version ?? 1, sequence: state?.seq ?? 0 };
}

registerIsolationCase({
  subject: updateGameNotStarted,
  name: "mark the target's upcoming game not started once it is scored",
  run: async (scope, target) => {
    const { version } = await scoredTargetGame(scope, target);
    return updateGameNotStarted(scope, target.upcomingGameId, version);
  },
});

registerIsolationCase({
  subject: markNotStarted,
  name: "mark the target's upcoming game not started once it is scored, with a reason",
  run: async (scope, target) => {
    const { sequence } = await scoredTargetGame(scope, target);
    return runAsApp(markNotStarted, harnessTx, scope, {
      gameId: target.upcomingGameId,
      sequence,
      reason: 'Harness: started by mistake',
    });
  },
});
