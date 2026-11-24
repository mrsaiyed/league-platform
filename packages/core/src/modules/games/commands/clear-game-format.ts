// Takes back the format one game was given (step 2.119): the game follows its season's
// rules again, as they stand. Allowed to the same people at the same times as giving one
// (game-format.ts): an admin before the game is under way, its scorer before the first
// play while the league lets scorekeepers change the format. A game given none is left
// as it is, and still moves on one version, as any save does.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { gameVersion } from '../game-fields.ts';
import { formatChangeOf, mayAskAboutFormat, type FormatRefusal } from '../game-format.ts';
import type { TrackerTx } from '../ports.ts';
import { lowerId } from '../scoring-session.ts';

export type ClearGameFormatError = {
  readonly code: 'game-not-found' | 'changed-since-read' | FormatRefusal;
};

export const clearGameFormat = defineCommand({
  name: 'games.clear_game_format',
  permission: 'games.score',
  input: z.object({ gameId: lowerId, version: gameVersion }),
  allowed: (context, input, tx: TrackerTx) => mayAskAboutFormat(context, tx, input.gameId),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ version: number }, ClearGameFormatError>> => {
    // The tracker's own lock, so a first play and this change never pass each other.
    if (!(await tx.games.lockGame(input.gameId))) return fail({ code: 'game-not-found' });
    const game = await tx.games.find(input.gameId);
    if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
    if (game.version !== input.version) return fail({ code: 'changed-since-read' });
    const change = await formatChangeOf(context, tx, game);
    if (!change.may) return fail({ code: change.reason });
    const version = await tx.games.setGivenFormat(game.id, null, game.version);
    if (version === undefined) return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'games.clear_game_format',
      target: { type: 'game', id: game.id },
      details: { as: change.as },
    });
    return ok({ version });
  },
});
