// Tells the game's page in the Games area, before the tap, whether "Put the sheet back as
// it was" is offered (step 2.229, T-366): the same rule the put back follows
// (sheet-put-back-rule.ts), and the same who (`games.correct`, the game's scope). It
// changes nothing, but runs in the same shape as a command (record 014).
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { gameScope, mayChangeGames } from '../policy.ts';
import type { TrackerTx } from '../ports.ts';
import { sheetPutBackRefusal, type SheetPutBackRefusal } from '../sheet-put-back-rule.ts';

export type SheetPutBackOffer =
  | { readonly offered: true }
  | { readonly offered: false; readonly code: SheetPutBackRefusal };

export type ReadSheetPutBackOfferError = { readonly code: 'game-not-found' };

export const readSheetPutBackOffer = defineCommand({
  name: 'games.read_sheet_put_back_offer',
  permission: 'games.correct',
  input: z.object({ gameId: z.uuid() }),
  allowed: async (context, input, tx: TrackerTx) =>
    mayChangeGames(context, tx, 'games.correct', await gameScope(tx, input.gameId)),
  run: async ({ input, tx }): Promise<Result<SheetPutBackOffer, ReadSheetPutBackOfferError>> => {
    const game = await tx.games.find(input.gameId);
    if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
    const code = sheetPutBackRefusal(game, await tx.games.newestCorrection(game.id));
    return ok(code === undefined ? { offered: true } : { offered: false, code });
  },
});
