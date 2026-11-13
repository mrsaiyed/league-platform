// Postpones a game that has not started (P7 §5.6): it waits in the list of games to be
// rescheduled, and counts for nothing meanwhile. Its date stays as it was, so the list
// can say what it was; giving it a new one is the schedule's work.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { gameVersion, isDecided } from '../game-fields.ts';
import { gameScope, mayChangeGames } from '../policy.ts';
import type { GamesTx } from '../ports.ts';

export type PostponeGameError = {
  readonly code:
    | 'game-not-found'
    | 'changed-since-read'
    | 'game-already-decided'
    | 'game-not-postponable';
};

export const postponeGame = defineCommand({
  name: 'games.postpone_game',
  permission: 'games.results',
  input: z.object({ gameId: z.uuid(), version: gameVersion }),
  allowed: async (context, input, tx: GamesTx) =>
    mayChangeGames(context, tx, 'games.results', await gameScope(tx, input.gameId)),
  run: async ({ context, input, tx }): Promise<Result<{ version: number }, PostponeGameError>> => {
    const game = await tx.games.find(input.gameId);
    if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
    if (game.version !== input.version) return fail({ code: 'changed-since-read' });
    if (isDecided(game.status)) return fail({ code: 'game-already-decided' });
    // Only a scheduled game: one already waiting, called off or being played is not postponed.
    if (game.status !== 'scheduled') return fail({ code: 'game-not-postponable' });
    const updated = await tx.games.setResult(
      game.id,
      { status: 'postponed', homeScore: null, awayScore: null, decided: false },
      input.version,
    );
    if (updated === undefined) return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'games.postpone_game',
      target: { type: 'game', id: game.id },
    });
    return ok({ version: updated });
  },
});
