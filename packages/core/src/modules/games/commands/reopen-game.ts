// Reopens a decided game (P7 §5.5, T6 §8): a final score or a forfeit is taken back so
// it can be fixed and decided again. It needs `games.correct` and a reason, and writes
// a game_corrections row in the same transaction (S-7): the database refuses to change
// a decided game's result without one. The row holds the result before and after as
// numbers only (T-220). A game entered by hand goes back to scheduled with no score,
// to be entered again. A tracked game (one with a saved state) is handed back to its
// tracker (step 2.30, T6 §8): live again with the score its plays give, to be fixed
// with the tracker's own tools and ended again (finish-tracked-game.ts). It takes the
// game's lock first, as every command that writes a live game does (T-111). Announces
// `games.reopened` (T-24), so standings can follow in the same transaction.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { gameReopened, type GameReopened } from '../../../events/game-events.ts';
import { correctionReason, gameVersion, isDecided } from '../game-fields.ts';
import { handBackTrackedGame } from '../finish-tracked-game.ts';
import { gameScope, mayChangeGames } from '../policy.ts';
import type { TrackerTx } from '../ports.ts';

export type ReopenGameError = {
  readonly code: 'game-not-found' | 'changed-since-read' | 'game-not-decided' | 'not-allowed';
};

export const reopenGame = defineCommand({
  name: 'games.reopen_game',
  permission: 'games.correct',
  input: z.object({ gameId: z.uuid(), version: gameVersion, reason: correctionReason }),
  allowed: async (context, input, tx: TrackerTx) =>
    mayChangeGames(context, tx, 'games.correct', await gameScope(tx, input.gameId)),
  run: async ({
    context,
    input,
    tx,
    emit,
  }): Promise<Result<{ version: number }, ReopenGameError>> => {
    if (!(await tx.scoringSessions.lockGame(input.gameId))) return fail({ code: 'game-not-found' });
    const game = await tx.games.find(input.gameId);
    if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
    if (game.version !== input.version) return fail({ code: 'changed-since-read' });
    // A correction names who made it; with no account there is no one to name.
    if (context.accountId === null) return fail({ code: 'not-allowed' });
    if (!isDecided(game.status)) return fail({ code: 'game-not-decided' });
    // The result before is kept in the correction. By hand: back to scheduled with the
    // scores cleared. Tracked: back to the tracker, live with its plays' score.
    const saved = await tx.liveGames.findState(game.id);
    const after =
      saved === undefined
        ? { status: 'scheduled', homeScore: null, awayScore: null }
        : await handBackTrackedGame(tx, game, saved, context.accountId, crypto.randomUUID());
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
