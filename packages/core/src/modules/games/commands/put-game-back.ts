// Puts a cancelled game back (P7 §5.6, S-51; A-5: one wrong tap must not lose a game). It
// is a scheduled game again, at the date and time it had, with no score: a cancelled game
// never has one (cancel-game.ts takes only a game that has not been decided), so the
// standings, which never counted it, have nothing to move. Whoever may cancel the game may
// put it back (`games.results`, at the game's program). Why is chosen from a fixed list
// and kept in the activity log with who did it (A-6): the log keeps ids and fixed words
// only (0004), so the reason is chosen, never typed, as marking a game not started does.
//
// The game's events (line-ups a scorer's table set before it was cancelled) are left as
// they are: the event log is never edited (T3), and they are the game's again when it is
// played.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { gameVersion } from '../game-fields.ts';
import { gameScope, mayChangeGames } from '../policy.ts';
import type { GamesTx } from '../ports.ts';

/** Why a cancelled game is put back, from a fixed list: the screen picks the words. */
export const putBackReasons = ['cancelledByMistake', 'willBePlayed', 'wrongGame', 'other'] as const;
export type PutBackReason = (typeof putBackReasons)[number];

export type PutGameBackError = {
  readonly code: 'game-not-found' | 'changed-since-read' | 'game-not-cancelled';
};

export const putGameBack = defineCommand({
  name: 'games.put_game_back',
  permission: 'games.results',
  input: z.object({
    gameId: z.uuid(),
    version: gameVersion,
    reason: z.enum(putBackReasons),
  }),
  // Whoever may cancel it (S-51): the same check as games.cancel_game.
  allowed: async (context, input, tx: GamesTx) =>
    mayChangeGames(context, tx, 'games.results', await gameScope(tx, input.gameId)),
  run: async ({ context, input, tx }): Promise<Result<{ version: number }, PutGameBackError>> => {
    const game = await tx.games.find(input.gameId);
    if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
    if (game.version !== input.version) return fail({ code: 'changed-since-read' });
    if (game.status !== 'cancelled') return fail({ code: 'game-not-cancelled' });
    const updated = await tx.games.setResult(
      game.id,
      { status: 'scheduled', homeScore: null, awayScore: null, decided: false },
      input.version,
    );
    if (updated === undefined) return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'games.put_game_back',
      target: { type: 'game', id: game.id },
      details: { reason: input.reason },
    });
    return ok({ version: updated });
  },
});
