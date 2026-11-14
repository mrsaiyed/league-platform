// Brings a game back from the bin (A-5): one a publish removed (step 2.21) that was
// never played. A game that was played is never in the bin; if one is, it is corrected
// or reopened, not restored (S-7). The game number and outside reference do not hold
// their place in the bin, so another game may have taken one; a game whose team,
// division, venue or court is still in the bin stays there until that is back.
import { z } from 'zod';
import { leagueScope, recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { binSeasonScope, mayRestore } from '../bin-policy.ts';
import type { BinTx } from '../bin.ts';

export type RestoreGameError = {
  readonly code:
    | 'game-not-found'
    | 'game-not-restorable'
    | 'game-part-in-bin'
    | 'game-number-taken'
    | 'game-reference-taken';
};

const neverPlayed = ['scheduled', 'postponed', 'cancelled'];

export const restoreGame = defineCommand({
  name: 'leagues.restore_game',
  permission: 'bin.restore',
  input: z.object({ gameId: z.uuid() }),
  allowed: async (context, input, tx: BinTx) => {
    const game = await tx.bin.findGame(input.gameId);
    return mayRestore(
      context,
      tx,
      game === undefined ? leagueScope : await binSeasonScope(tx, game.seasonId),
    );
  },
  run: async ({ context, input, tx }): Promise<Result<{ gameId: string }, RestoreGameError>> => {
    const game = await tx.bin.findGame(input.gameId);
    if (game === undefined) return fail({ code: 'game-not-found' });
    if (!game.binned) return ok({ gameId: input.gameId });
    if (!neverPlayed.includes(game.status)) return fail({ code: 'game-not-restorable' });
    if (game.partInBin) return fail({ code: 'game-part-in-bin' });
    const restored = await tx.bin.restoreGame(input.gameId);
    if (restored === 'game-number-taken') return fail({ code: 'game-number-taken' });
    if (restored === 'external-ref-taken') return fail({ code: 'game-reference-taken' });
    if (restored === false) return fail({ code: 'game-not-restorable' });
    await recordActivity(tx, context, {
      action: 'leagues.restore_game',
      target: { type: 'game', id: input.gameId },
    });
    return ok({ gameId: input.gameId });
  },
});
