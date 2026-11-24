// Gives one game its own format (step 2.119; P7 §5.1, S-21, S-35): by an admin from the
// games area at any time before the game is under way, or by whoever scores it at the
// table before the first play, while the league lets scorekeepers (game-format.ts). It
// is kept apart from the rules fixed when the game starts (T-340): the game starts under
// it, and marking the game not started returns it to it. The game's other rules (ties,
// statistics, standings) stay its season's.
import { GameFormatRules } from '@srleagues/contracts';
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { gameVersion } from '../game-fields.ts';
import { formatChangeOf, mayAskAboutFormat, type FormatRefusal } from '../game-format.ts';
import type { TrackerTx } from '../ports.ts';
import { lowerId } from '../scoring-session.ts';
import { gameInArchivedSeason } from '../archived-season.ts';

export type GiveGameFormatError = {
  readonly code: 'game-not-found' | 'changed-since-read' | FormatRefusal;
};

export const giveGameFormat = defineCommand({
  name: 'games.give_game_format',
  permission: 'games.score',
  refusedInArchivedSeason: gameInArchivedSeason,
  input: z.object({ gameId: lowerId, version: gameVersion, format: GameFormatRules }),
  allowed: (context, input, tx: TrackerTx) => mayAskAboutFormat(context, tx, input.gameId),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ version: number }, GiveGameFormatError>> => {
    // The tracker's own lock, so a first play and this change never pass each other.
    if (!(await tx.games.lockGame(input.gameId))) return fail({ code: 'game-not-found' });
    const game = await tx.games.find(input.gameId);
    if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
    if (game.version !== input.version) return fail({ code: 'changed-since-read' });
    const change = await formatChangeOf(context, tx, game);
    if (!change.may) return fail({ code: change.reason });
    const version = await tx.games.setGivenFormat(game.id, input.format, game.version);
    if (version === undefined) return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'games.give_game_format',
      target: { type: 'game', id: game.id },
      details: {
        as: change.as,
        periods: input.format.gameFormat.periods,
        periodSeconds: input.format.gameFormat.periodSeconds,
        clockMode: input.format.clock.mode,
      },
    });
    return ok({ version });
  },
});
