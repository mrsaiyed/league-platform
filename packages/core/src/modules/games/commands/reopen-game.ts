// Reopens a decided game (P7 §5.5, T6 §8): a final score or a forfeit is taken back so
// it can be fixed and decided again. It needs `games.correct` and a reason, and writes
// a game_corrections row in the same transaction (S-7): the database refuses to change
// a decided game's result without one. The row holds the result before and after as
// numbers only (T-220). A game tracked live goes back to live, keeping its score for
// the tracker to fix; any other goes back to scheduled with no score, to be entered
// again. Announces `games.reopened` (T-24), so standings can follow.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { gameReopened, type GameReopened } from '../events.ts';
import { correctionReason, gameVersion, isDecided } from '../game-fields.ts';
import { gameScope, mayChangeGames } from '../policy.ts';
import type { GamesTx } from '../ports.ts';

export type ReopenGameError = {
  readonly code: 'game-not-found' | 'changed-since-read' | 'game-not-decided';
};

export const reopenGame = defineCommand({
  name: 'games.reopen_game',
  permission: 'games.correct',
  input: z.object({ gameId: z.uuid(), version: gameVersion, reason: correctionReason }),
  allowed: async (context, input, tx: GamesTx) =>
    mayChangeGames(context, tx, 'games.correct', await gameScope(tx, input.gameId)),
  run: async ({
    context,
    input,
    tx,
    emit,
  }): Promise<Result<{ version: number }, ReopenGameError>> => {
    const game = await tx.games.find(input.gameId);
    if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
    if (game.version !== input.version) return fail({ code: 'changed-since-read' });
    if (!isDecided(game.status) || context.accountId === null) {
      return fail({ code: 'game-not-decided' });
    }
    const backToLive = game.status === 'final' && game.captureMode === 'live';
    const after = {
      status: backToLive ? 'live' : 'scheduled',
      homeScore: backToLive ? game.homeScore : null,
      awayScore: backToLive ? game.awayScore : null,
    };
    await tx.games.addCorrection({
      gameId: game.id,
      accountId: context.accountId,
      reason: input.reason,
      before: {
        version: 1 as const,
        status: game.status,
        homeScore: game.homeScore,
        awayScore: game.awayScore,
      },
      after: { version: 1 as const, ...after },
    });
    const updated = await tx.games.setResult(game.id, { ...after, decided: false }, input.version);
    if (updated === undefined) return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'games.reopen_game',
      target: { type: 'game', id: game.id },
    });
    const event: GameReopened = {
      type: gameReopened,
      leagueId: context.leagueId,
      gameId: game.id,
      seasonId: game.seasonId,
    };
    emit(event);
    return ok({ version: updated });
  },
});
