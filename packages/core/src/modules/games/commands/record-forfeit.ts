// Records a forfeit (P7 §5.6): the team that forfeits loses, the other wins, at the
// league's forfeit score from the season's rules. No player statistics: a reopened box
// score game recorded now as a forfeit loses its old lines in the same transaction, as a
// final score only does (S-27), so they no longer count in totals. Announces
// `games.finalized` (T-24). Needs `games.results`, as postponing and cancelling do.
import { z } from 'zod';
import { defineCommand, fail, type Result } from '../../../command/index.ts';
import { decideGame, openGame, type DecideGameError } from '../decide-game.ts';
import { gameVersion } from '../game-fields.ts';
import { gameScope, mayChangeGames } from '../policy.ts';
import type { GamesTx } from '../ports.ts';
import { effectiveRulesOf } from '../season-rules-of.ts';

export type RecordForfeitError = DecideGameError;

export const recordForfeit = defineCommand({
  name: 'games.record_forfeit',
  permission: 'games.results',
  input: z.object({
    gameId: z.uuid(),
    version: gameVersion,
    /** The team that forfeits: one of the game's two. */
    forfeitingTeamId: z.uuid(),
  }),
  allowed: async (context, input, tx: GamesTx) =>
    mayChangeGames(context, tx, 'games.results', await gameScope(tx, input.gameId)),
  run: async ({
    context,
    input,
    tx,
    emit,
  }): Promise<Result<{ version: number }, RecordForfeitError>> => {
    const open = openGame(await tx.games.find(input.gameId), input.version);
    if (!open.ok) return open;
    const game = open.value;
    const homeForfeits = input.forfeitingTeamId === game.homeTeamId;
    if (!homeForfeits && input.forfeitingTeamId !== game.awayTeamId) {
      return fail({ code: 'team-not-in-game' });
    }
    const { forfeit } = await effectiveRulesOf(tx, game);
    // A forfeit has no player statistics (P7 §5.6): a box score's old lines go (S-27).
    const wasBox = game.captureMode === 'box';
    if (wasBox) await tx.games.replaceLines(game.id, []);
    return decideGame({
      context,
      tx,
      emit,
      game,
      version: input.version,
      action: 'games.record_forfeit',
      status: 'forfeit',
      homeScore: homeForfeits ? forfeit.loserScore : forfeit.winnerScore,
      awayScore: homeForfeits ? forfeit.winnerScore : forfeit.loserScore,
      ...(wasBox ? { captureMode: 'final' as const } : {}),
    });
  },
});
