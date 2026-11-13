// Records a game's final score by hand (P7 §5.2, T6 §9): two numbers, and the game is
// final. A tie is refused unless the season allows ties (P7 §5.6). The game keeps or
// takes the rules it is played under (S-1). Announces `games.finalized` (T-24), so
// standings can follow. A game already decided is changed only by reopening it, with
// a reason (S-7).
import { z } from 'zod';
import { defineCommand, fail, type Result } from '../../../command/index.ts';
import { decideGame, openGame, type DecideGameError } from '../decide-game.ts';
import { gameScore, gameVersion } from '../game-fields.ts';
import { mayScoreGame } from '../policy.ts';
import type { GamesTx } from '../ports.ts';
import { effectiveRulesOf } from '../season-rules-of.ts';

export type RecordFinalScoreError = DecideGameError;

export const recordFinalScore = defineCommand({
  name: 'games.record_final_score',
  permission: 'games.score',
  input: z.object({
    gameId: z.uuid(),
    version: gameVersion,
    homeScore: gameScore,
    awayScore: gameScore,
  }),
  // Whoever may score this game, by the league's setting (P4 §4).
  allowed: (context, input, tx: GamesTx) => mayScoreGame(context, tx, input.gameId),
  run: async ({
    context,
    input,
    tx,
    emit,
  }): Promise<Result<{ version: number }, RecordFinalScoreError>> => {
    const open = openGame(await tx.games.find(input.gameId), input.version);
    if (!open.ok) return open;
    const game = open.value;
    if (input.homeScore === input.awayScore) {
      const rules = await effectiveRulesOf(tx, game);
      if (!rules.allowTies) return fail({ code: 'tie-not-allowed' });
    }
    return decideGame({
      context,
      tx,
      emit,
      game,
      version: input.version,
      action: 'games.record_final_score',
      status: 'final',
      homeScore: input.homeScore,
      awayScore: input.awayScore,
    });
  },
});
