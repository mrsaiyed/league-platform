// Records a game's final score by hand (P7 §5.2, T6 §9): two numbers, and the game is
// final. A tie is refused unless the season allows ties (P7 §5.6). The game keeps or
// takes the rules it is played under (S-1). Announces `games.finalized` (T-24), so
// standings can follow. A game already decided is changed only by reopening it, with
// a reason (S-7). A game that was a box score and is saved now with two numbers only
// loses its old lines in the same transaction (S-27), so they no longer count. A game
// the live tracker has recorded plays of is refused (`game-is-tracked`, S-46): it is
// ended in the tracker, so its plays still explain its numbers; one set to live tracking
// with no plays yet can still be finished with two numbers. A postponed game is refused
// (`game-postponed`, step 2.158): it has not been played. It may say how many overtime
// periods the game went to (step 2.56, S-86), 0 for none, which the pages mark as the
// tracker's own end does (step 2.200); left out, it is not known.
import { z } from 'zod';
import { defineCommand, fail, type Result } from '../../../command/index.ts';
import { decideGame, openGameToScore, type DecideGameError } from '../decide-game.ts';
import { gameScore, gameVersion } from '../game-fields.ts';
import { mayScoreGame } from '../policy.ts';
import type { GamesTx } from '../ports.ts';
import { effectiveRulesOf } from '../season-rules-of.ts';
import { gameInArchivedSeasonUncorrected } from '../archived-season.ts';

export type RecordFinalScoreError = DecideGameError;

/** The most overtime periods a game can have: the engine's last period is 20 (migration 0021). */
export const maxOvertimePeriods = 18;

export const recordFinalScore = defineCommand({
  name: 'games.record_final_score',
  permission: 'games.score',
  refusedInArchivedSeason: gameInArchivedSeasonUncorrected,
  input: z.object({
    gameId: z.uuid(),
    version: gameVersion,
    homeScore: gameScore,
    awayScore: gameScore,
    /** Overtime periods played: 0 to 18, as the tracker's engine allows (migration 0021). */
    overtimePeriods: z.number().int().min(0).max(maxOvertimePeriods).optional(),
  }),
  // Whoever may score this game, by the league's setting (P4 §4).
  allowed: (context, input, tx: GamesTx) => mayScoreGame(context, tx, input.gameId),
  run: async ({
    context,
    input,
    tx,
    emit,
  }): Promise<Result<{ version: number }, RecordFinalScoreError>> => {
    // A postponed game is refused there too (step 2.158, S-75): it has not been played.
    const open = await openGameToScore(tx, input.gameId, input.version);
    if (!open.ok) return open;
    const game = open.value;
    if (input.homeScore === input.awayScore) {
      const rules = await effectiveRulesOf(tx, game);
      if (!rules.allowTies) return fail({ code: 'tie-not-allowed' });
    }
    // A reopened box score game saved now as a final score only: its old lines are
    // cleared in this transaction, so they no longer count in totals (P7 §5.2, S-27).
    const wasBox = game.captureMode === 'box';
    if (wasBox) await tx.games.replaceLines(game.id, []);
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
      ...(wasBox ? { captureMode: 'final' as const } : {}),
      ...(input.overtimePeriods === undefined ? {} : { overtimePeriods: input.overtimePeriods }),
    });
  },
});
