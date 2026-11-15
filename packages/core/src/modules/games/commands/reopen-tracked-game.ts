// The scorekeeper reopens a game they just ended (step 2.120; P7 §5.5, S-36, A-5; record
// 060, T-263): the way back from End game tapped too soon. A second door beside the
// admin's games.reopen_game, which stays as it is, with a rule of its own: whoever may
// score this game now (read fresh, T-75), and then reopen-window.ts's rule, the same one
// the device reads before the tap (games.read_reopen_offer): only a game its tracker
// ended; someone who may correct games at any time; otherwise only the account that
// sent its latest end, within the league's minutes, measured inside the database.
//
// - A reason, as for an admin (S-7): written as a game_corrections row in the same
//   transaction, with who, and the result before and after as numbers only (T-220).
// - `requestId`, made once by the device for this reopen, becomes the reopen event's
//   command id. A retry with the same id, after an answer lost on the way, finds that
//   event and is answered "reopened" again (with the game's number now), never "this
//   game is not over". The same id from another account, or on another kind of event,
//   or arriving once the game has been decided again, is refused (changed-since-read).
// - `sequence`, when given, is the number of the last tap the device knows of (its End
//   game): a game that moved on since is refused. It is optional: a reopen takes nothing
//   away, and a device that never scored the game has no number.
//
// What reopening does is the admin's own for a tracked game (finish-tracked-game.ts):
// the engine's reopen is kept in the event log, the game is live again with the score
// its plays give, and the lines are what the plays give until it is ended again. The
// game's scoring session is left as it is, so the device that scored it opens it again
// and carries on. It takes the game's lock first (T-111), is logged, and announces
// `games.reopened` (T-24), so standings and season totals follow in the same transaction.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { gameReopened, type GameReopened } from '../../../events/game-events.ts';
import { correctionReason, isDecided } from '../game-fields.ts';
import { handBackTrackedGame } from '../finish-tracked-game.ts';
import { mayScoreGame } from '../policy.ts';
import type { TrackerTx } from '../ports.ts';
import { reopenOffer, type ReopenNotOffered } from '../reopen-window.ts';
import { lowerId, scorerOf } from '../scoring-session.ts';

export type ReopenTrackedGameError =
  | { readonly code: 'game-not-found' | 'changed-since-read' }
  | {
      readonly code: ReopenNotOffered;
      /** The account that sent the game's latest end, when there is one. */
      readonly endedBy: string | null;
    };

/** A tap's place in the game's event log (1, 2, 3 …), as the tracker numbers them. */
const tapSequence = z.number().int().positive();

export const reopenTrackedGame = defineCommand({
  name: 'games.reopen_tracked_game',
  permission: 'games.score',
  input: z.object({
    gameId: lowerId,
    requestId: lowerId,
    sequence: tapSequence.optional(),
    reason: correctionReason,
  }),
  allowed: (context, input, tx: TrackerTx) => mayScoreGame(context, tx, input.gameId),
  run: async ({
    context,
    input,
    tx,
    emit,
  }): Promise<Result<{ sequence: number }, ReopenTrackedGameError>> => {
    const accountId = scorerOf(context);
    if (!(await tx.scoringSessions.lockGame(input.gameId))) return fail({ code: 'game-not-found' });
    const game = await tx.games.find(input.gameId);
    if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
    const saved = await tx.liveGames.findState(game.id);
    // A retry of a reopen already made: the same answer, nothing done twice.
    const earlier = await tx.liveGames.findEvent(game.id, input.requestId);
    if (earlier !== undefined) {
      // Not this account's reopen, or the game has been decided again since: the device's
      // picture is out of date, whatever its request once did.
      if (earlier.type !== 'reopen' || earlier.accountId !== accountId || isDecided(game.status)) {
        return fail({ code: 'changed-since-read' });
      }
      return ok({ sequence: saved?.seq ?? earlier.seq });
    }
    const offer = await reopenOffer(context, tx, game, saved);
    if (offer.reopen.when === 'no') {
      return fail({ code: offer.reopen.code, endedBy: offer.endedBy });
    }
    // The offer is "always" or "until" only for a game with a saved, ended state.
    if (saved === undefined) throw new Error('A reopened game has no saved state.');
    if (input.sequence !== undefined && input.sequence !== saved.seq) {
      return fail({ code: 'changed-since-read' });
    }
    const after = await handBackTrackedGame(tx, game, saved, accountId, input.requestId);
    await tx.games.addCorrection({
      gameId: game.id,
      accountId,
      reason: input.reason,
      before: {
        version: 1 as const,
        status: game.status,
        homeScore: game.homeScore,
        awayScore: game.awayScore,
      },
      after: { version: 1 as const, ...after },
    });
    // The game is locked and was read after the lock: it cannot have moved on.
    const updated = await tx.games.setResult(game.id, { ...after, decided: false }, game.version);
    if (updated === undefined) throw new Error('A locked game changed while it was reopened.');
    await recordActivity(tx, context, {
      action: 'games.reopen_tracked_game',
      target: { type: 'game', id: game.id },
    });
    const event: GameReopened = {
      type: gameReopened,
      leagueId: context.leagueId,
      gameId: game.id,
      seasonId: game.seasonId,
    };
    emit(event);
    // The engine's reopen was saved as the event after the end (handBackTrackedGame).
    return ok({ sequence: saved.seq + 1 });
  },
});
