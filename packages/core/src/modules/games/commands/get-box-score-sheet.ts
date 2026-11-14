// What the box score grid shows for one game (P7 §5.2): the game, the players of both
// teams' rosters, the lines already saved (to correct a game reopened for it, or to see
// a decided one), and the stat columns its rules keep, plus any stat its lines already
// hold. It says whether the sheet can be saved now, and if not, why. It changes
// nothing, but runs in the same shape as a command (record 014), for whoever may score
// the game. It also says whether this reader may reopen it here, by the same check
// games.reopen_game makes, so the page offers only what the command would accept. A
// game scored with the live tracker is corrected in the tracker, even once final.
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { boxScoreColumns } from '../box-score-columns.ts';
import { isDecided } from '../game-fields.ts';
import { gameScope, mayChangeGames, mayScoreGame } from '../policy.ts';
import type { GameLine, GameRecord, GameRosterPlayer, GamesTx } from '../ports.ts';
import { effectiveRulesOf } from '../season-rules-of.ts';

export type BoxScoreSheet = {
  readonly game: GameRecord;
  /** Whether this reader may reopen the game here: games.reopen_game would accept it. */
  readonly mayReopen: boolean;
  readonly players: readonly GameRosterPlayer[];
  readonly lines: readonly GameLine[];
  readonly statKeys: readonly string[];
  /** Whether the grid asks for minutes played. */
  readonly minutes: boolean;
  /**
   * Null when the sheet can be saved; otherwise why not: the game is cancelled, tracked
   * live (corrected in the tracker's grid, even once final), or decided (reopen it to
   * correct it).
   */
  readonly locked: 'decided' | 'cancelled' | 'tracked' | null;
};

export type GetBoxScoreSheetError = { readonly code: 'game-not-found' };

export const getBoxScoreSheet = defineCommand({
  name: 'games.get_box_score_sheet',
  permission: 'games.score',
  input: z.object({ gameId: z.uuid() }),
  allowed: (context, input, tx: GamesTx) => mayScoreGame(context, tx, input.gameId),
  run: async ({ context, input, tx }): Promise<Result<BoxScoreSheet, GetBoxScoreSheetError>> => {
    const game = await tx.games.find(input.gameId);
    if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
    // One after another: they share the transaction's one connection.
    const rules = await effectiveRulesOf(tx, game);
    const players = await tx.games.listRoster(game.id);
    const lines = await tx.games.listLines(game.id);
    const tracked = game.status === 'live' || (await tx.games.hasPlays(game.id));
    const columns = boxScoreColumns(rules.statistics);
    const saved = lines.flatMap((line) => Object.keys(line.stats));
    const statKeys = [...new Set([...columns.statKeys, ...saved])];
    const locked =
      game.status === 'cancelled'
        ? 'cancelled'
        : tracked
          ? 'tracked'
          : isDecided(game.status)
            ? 'decided'
            : null;
    const mayReopen =
      locked === 'decided' &&
      context.accountId !== null &&
      (await mayChangeGames(context, tx, 'games.correct', await gameScope(tx, game.id)));
    return ok({
      game,
      mayReopen,
      players,
      lines,
      statKeys,
      minutes: columns.minutes || lines.some((line) => line.secondsPlayed !== null),
      locked,
    });
  },
});
