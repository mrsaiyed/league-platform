// The scorekeeper reopens a result they recorded by hand (step 2.177; P7 §5.5, S-52,
// S-36, A-5): the way back from two numbers typed into the wrong card. A second door
// beside the admin's games.reopen_game, which stays as it is, as the tracker's
// games.reopen_tracked_game is (step 2.120): whoever may score this game now (read
// fresh, T-75), and then own-result-window.ts's rule, the same one the page reads before
// the tap (games.read_own_result_offer): only a result recorded by hand; someone who may
// correct games at any time; otherwise only the account that recorded it, within the
// league's minutes, measured inside the database. A refusal names who can: those who may
// correct games (`games.correct`: a league admin or a scheduler), and who recorded it.
//
// - A reason, as for an admin (S-7): written as a game_corrections row in the same
//   transaction, with who, and the result before and after as numbers only (T-220).
// - `version` is the game's as the page read it (T-46). A second tap of the same request
//   finds the game moved on and is refused (`changed-since-read`) before anything is
//   written, so a double tap makes one correction and one activity entry (T-348).
//
// What reopening does is the admin's own for a game entered by hand: back to scheduled
// with no score and no overtime count, to be entered again. It takes the game's lock
// first (T-111), is logged, and announces `games.reopened` (T-24), so standings follow
// in the same transaction.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { gameReopened, type GameReopened } from '../../../events/game-events.ts';
import { correctionReason, gameVersion } from '../game-fields.ts';
import { ownResultOffer, type OwnResultNotOffered } from '../own-result-window.ts';
import { mayScoreGame } from '../policy.ts';
import type { TrackerTx } from '../ports.ts';

export type ReopenOwnResultError =
  | { readonly code: 'game-not-found' | 'changed-since-read' | 'not-allowed' }
  | {
      readonly code: OwnResultNotOffered;
      /** Who can reopen it instead: whoever may correct games (an admin or a scheduler). */
      readonly whoCan: 'games.correct';
      /** The account that recorded the result by hand, when there is one. */
      readonly recordedBy: string | null;
    };

export const reopenOwnResult = defineCommand({
  name: 'games.reopen_own_result',
  permission: 'games.score',
  input: z.object({ gameId: z.uuid(), version: gameVersion, reason: correctionReason }),
  allowed: (context, input, tx: TrackerTx) => mayScoreGame(context, tx, input.gameId),
  run: async ({
    context,
    input,
    tx,
    emit,
  }): Promise<Result<{ version: number }, ReopenOwnResultError>> => {
    if (!(await tx.scoringSessions.lockGame(input.gameId))) return fail({ code: 'game-not-found' });
    const game = await tx.games.find(input.gameId);
    if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
    // A second tap of a reopen already made finds the game moved on: nothing twice.
    if (game.version !== input.version) return fail({ code: 'changed-since-read' });
    // A correction names who made it; with no account there is no one to name.
    if (context.accountId === null) return fail({ code: 'not-allowed' });
    const offer = await ownResultOffer(context, tx, game);
    if (offer.reopen.when === 'no') {
      return fail({
        code: offer.reopen.code,
        whoCan: 'games.correct',
        recordedBy: offer.recordedBy,
      });
    }
    const after = { status: 'scheduled', homeScore: null, awayScore: null };
    await tx.games.addCorrection({
      gameId: game.id,
      accountId: context.accountId,
      reason: input.reason,
      before: {
        version: 1 as const,
        status: game.status,
        homeScore: game.homeScore,
        awayScore: game.awayScore,
      },
      after: { version: 1 as const, ...after },
    });
    const updated = await tx.games.setResult(
      game.id,
      { ...after, decided: false, overtimePeriods: null },
      input.version,
    );
    if (updated === undefined) return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'games.reopen_own_result',
      target: { type: 'game', id: game.id },
    });
    const event: GameReopened = {
      type: gameReopened,
      leagueId: context.leagueId,
      gameId: game.id,
      seasonId: game.seasonId,
    };
    emit(event);
    return ok({ version: updated });
  },
});
