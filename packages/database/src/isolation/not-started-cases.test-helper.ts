// The two-league harness's cases for marking a game not started (step 2.121, S-40):
// the target's upcoming game is scored first (a lineup and a basket, as in
// games-cases.test-helper.ts), in the run's own rolled-back transaction, so in the
// target's league there is a live game with plays, lines and a session to clear.
// Anywhere else the scoring is refused and there is nothing of the target's to reach.
import { markNotStarted } from '@srleagues/core';
import { randomUUID } from 'node:crypto';
import { transactionOf, type LeagueScope } from '../db/transaction-scope.ts';
import { gameWasDecided, insertGameEvents, updateGameNotStarted } from '../queries/index.ts';
import { CommandRefused, harnessTx, runAsApp } from './command-cases.test-helper.ts';
import { scoreTargetUpcomingGame } from './games-cases.test-helper.ts';
import { registerIsolationCase } from './isolation-registry.test-helper.ts';
import { harnessNow, type LeagueRecords } from './two-leagues.test-helper.ts';

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

// The target's final game has a log with plays and was decided: there is something to learn.
registerIsolationCase({
  subject: gameWasDecided,
  name: "ask whether the target's final game was ever decided",
  run: (scope, target) => gameWasDecided(scope, target.gameId),
});

registerIsolationCase({
  subject: updateGameNotStarted,
  name: "mark the target's upcoming game not started once it is scored",
  run: async (scope, target) => {
    const { version, sequence } = await scoredTargetGame(scope, target);
    // The database clears a game's rules only behind the command's own marker (0016):
    // written where the game was scored, that is in the target's own league only.
    if (sequence > 0) {
      await insertGameEvents(scope, [
        {
          gameId: target.upcomingGameId,
          seq: sequence + 1,
          commandId: '01900000-0000-7000-8000-00000000c2a1',
          type: 'reset',
          payload: { clearedThrough: sequence },
          tappedAt: harnessNow,
          accountId: scope.accountId ?? randomUUID(),
        },
      ]);
    }
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
      reason: 'startedByMistake',
    });
  },
});
