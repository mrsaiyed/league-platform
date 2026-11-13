// Cancels a game that has not started (P7 §5.6): it counts for nothing. A game
// already decided is changed only by reopening it, with a reason (S-7); one being
// played is ended or reopened by its tracker (step 2.30).
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { gameVersion, isDecided } from '../game-fields.ts';
import { gameScope, mayChangeGames } from '../policy.ts';
import type { GamesTx } from '../ports.ts';

export type CancelGameError = {
  readonly code:
    | 'game-not-found'
    | 'changed-since-read'
    | 'game-already-decided'
    | 'game-not-cancellable';
};

export const cancelGame = defineCommand({
  name: 'games.cancel_game',
  permission: 'games.results',
  input: z.object({ gameId: z.uuid(), version: gameVersion }),
  allowed: async (context, input, tx: GamesTx) =>
    mayChangeGames(context, tx, 'games.results', await gameScope(tx, input.gameId)),
  run: async ({ context, input, tx }): Promise<Result<{ version: number }, CancelGameError>> => {
    const game = await tx.games.find(input.gameId);
    if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
    if (game.version !== input.version) return fail({ code: 'changed-since-read' });
    if (isDecided(game.status)) return fail({ code: 'game-already-decided' });
    if (game.status !== 'scheduled' && game.status !== 'postponed') {
      return fail({ code: 'game-not-cancellable' });
    }
    const updated = await tx.games.setResult(
      game.id,
      { status: 'cancelled', homeScore: null, awayScore: null, decided: false },
      input.version,
    );
    if (updated === undefined) return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'games.cancel_game',
      target: { type: 'game', id: game.id },
    });
    return ok({ version: updated });
  },
});
