// The two-league harness's cases for correcting a tracked game in its box score grid
// (step 2.65, T-122): another league's admin cannot read the grid of this league's game
// nor correct it. In the run's own rolled-back transaction the target's final game, ended
// from the tracker with plays, is reopened with a reason and its grid saved with the last
// event number read in that scope. In the target's league its owner may correct it; anywhere
// else the reopen is refused, the game is not found, and nothing of the target is reached.
import { correctTrackedBoxScore, readTrackedBoxScore, reopenGame } from '@srleagues/core';
import { transactionOf } from '../db/transaction-scope.ts';
import {
  CommandRefused,
  harnessTx,
  registerCommandCase,
  runAsApp,
} from './command-cases.test-helper.ts';
import { registerIsolationCase } from './isolation-registry.test-helper.ts';

registerCommandCase(readTrackedBoxScore, harnessTx, {
  name: "read the box score grid of the target's tracked final game",
  input: (target) => ({ gameId: target.gameId }),
});

registerIsolationCase({
  subject: correctTrackedBoxScore,
  name: "correct the target's tracked final game in its grid, once reopened",
  run: async (scope, target) => {
    await runAsApp(reopenGame, harnessTx, scope, {
      gameId: target.gameId,
      version: 1,
      reason: 'Harness reopening',
    }).catch((thrown: unknown) => {
      if (thrown instanceof CommandRefused) return undefined;
      throw thrown;
    });
    const last = await transactionOf(scope)
      .selectFrom('game_events')
      .select((eb) => eb.fn.max('seq').as('seq'))
      .where('league_id', '=', scope.leagueId)
      .where('game_id', '=', target.gameId)
      .executeTakeFirst();
    return runAsApp(correctTrackedBoxScore, harnessTx, scope, {
      gameId: target.gameId,
      sequence: Number(last?.seq ?? 0),
      lines: [],
    });
  },
});
