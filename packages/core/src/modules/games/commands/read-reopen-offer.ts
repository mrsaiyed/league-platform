// Tells the scorekeeper's device, before the tap, whether Reopen is offered (step 2.120;
// S-36; record 060, T-263): always (they may correct games), until a time by the
// server's clock (they ended it, within the league's minutes), or not, with the reason;
// and which account ended the game, for the device to name. The same rule the reopen
// itself follows (reopen-window.ts), so no one types a reason and is then told it is too
// late. Only whoever may score the game may ask (`games.score`, mayScoreGame, read
// fresh, T-75). It changes nothing, but runs in the same shape as a command (record 014).
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayScoreGame } from '../policy.ts';
import type { TrackerTx } from '../ports.ts';
import { reopenOffer, type ReopenOffer } from '../reopen-window.ts';
import { lowerId } from '../scoring-session.ts';

export type ReadReopenOfferError = { readonly code: 'game-not-found' };

export const readReopenOffer = defineCommand({
  name: 'games.read_reopen_offer',
  permission: 'games.score',
  input: z.object({ gameId: lowerId }),
  allowed: (context, input, tx: TrackerTx) => mayScoreGame(context, tx, input.gameId),
  run: async ({ context, input, tx }): Promise<Result<ReopenOffer, ReadReopenOfferError>> => {
    const game = await tx.games.find(input.gameId);
    if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
    return ok(await reopenOffer(context, tx, game, await tx.liveGames.findState(game.id)));
  },
});
