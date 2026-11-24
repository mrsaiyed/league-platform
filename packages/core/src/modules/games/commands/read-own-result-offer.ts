// Tells the Games page, before the tap, whether "Correct this result" is offered for a
// result recorded by hand (step 2.177; P7 §5.5, S-52, S-36): always (they may correct
// games), until a time by the server's clock (they recorded it, within the league's
// minutes), or not, with the reason; and who recorded it. The same rule the reopen itself
// follows (own-result-window.ts), so no one types a reason and is then told it is too
// late. Only whoever may score the game may ask (`games.score`, mayScoreGame, read
// fresh, T-75). It changes nothing, but runs in the same shape as a command (record 014).
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { ownResultOffer, type OwnResultOffer } from '../own-result-window.ts';
import { mayScoreGame } from '../policy.ts';
import type { TrackerTx } from '../ports.ts';

export type ReadOwnResultOfferError = { readonly code: 'game-not-found' };

export const readOwnResultOffer = defineCommand({
  name: 'games.read_own_result_offer',
  permission: 'games.score',
  input: z.object({ gameId: z.uuid() }),
  allowed: (context, input, tx: TrackerTx) => mayScoreGame(context, tx, input.gameId),
  run: async ({ context, input, tx }): Promise<Result<OwnResultOffer, ReadOwnResultOfferError>> => {
    const game = await tx.games.find(input.gameId);
    if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
    return ok(await ownResultOffer(context, tx, game));
  },
});
