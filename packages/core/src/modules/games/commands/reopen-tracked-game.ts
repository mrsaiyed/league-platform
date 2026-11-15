// The scorekeeper reopens a game they just ended (step 2.120; P7 §5.5, S-36, A-5; record
// 060, T-263): the way back from End game tapped too soon. A second door beside the
// admin's games.reopen_game, which stays as it is, with a rule of its own:
//
// - Only a game its tracker ended: final, with a saved state the engine ended. A game
//   entered as a final score or a box score, a forfeit, or one decided by hand while
//   its tracker was live is refused (not-ended-by-tracker): it is reopened by someone
//   who may correct games, from the games area.
// - Whoever may score this game now (read fresh, T-75: the league's setting, the
//   assignment, a role taken away a moment ago, a league archived or suspended).
// - Then either they may also correct games at the game's program (an owner, an admin,
//   a scheduler): reopened at any time, as the admin's own door allows. Or they are the
//   account that sent the game's latest end (its `end` event), and it ended no longer
//   ago than the league's setting allows (games.scorekeeperReopenMinutes, 30 minutes to
//   begin with; 0 means never). The time is measured from the game's `finalizedAt`,
//   stamped by the database in the transaction that ended it, to the server's clock
//   now (the transaction's `clock`), never from the device's clock. Exactly the
//   setting's minutes still counts.
// - A reason, as for an admin (S-7): written as a game_corrections row in the same
//   transaction, with who, and the result before and after as numbers only (T-220).
// - The sequence number of the end as the device knows it (the tracker holds the
//   game's event numbers, not its version): a game that moved on since, reopened and
//   ended again by someone else for one, is refused (changed-since-read).
//
// What reopening does is the admin's own for a tracked game (finish-tracked-game.ts):
// the engine's reopen is kept in the event log, the game is live again with the score
// its plays give, and the lines are what the plays give until it is ended again. The
// game's scoring session is left as it is, so the device that scored it opens it
// again and carries on. It takes the game's lock first (T-111), is logged, and
// announces `games.reopened` (T-24), so standings and season totals follow in the
// same transaction.
//
// O-12 (an archived season changes only by a correction from someone who may correct
// games): seasons cannot be archived yet. Step 2.130, which archives them, must refuse
// the scorekeeper's way here for a game of an archived season.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { lookupSetting, scorekeeperReopenMinutes } from '../../leagues/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { gameReopened, type GameReopened } from '../../../events/game-events.ts';
import { correctionReason, isDecided } from '../game-fields.ts';
import { handBackTrackedGame } from '../finish-tracked-game.ts';
import { readState } from '../live-game.ts';
import { gameScope, mayChangeGames, mayScoreGame } from '../policy.ts';
import type { GameRecord, TrackerTx } from '../ports.ts';
import { lowerId, scorerOf } from '../scoring-session.ts';

export type ReopenTrackedGameError = {
  readonly code:
    | 'game-not-found'
    | 'changed-since-read'
    | 'game-not-decided'
    | 'not-ended-by-tracker'
    | 'scorekeepers-may-not-reopen'
    | 'not-ended-by-you'
    | 'reopen-time-over';
};

const minuteMs = 60_000;

/** A tap's place in the game's event log (1, 2, 3 …), as the tracker numbers them. */
const tapSequence = z.number().int().positive();

/** How long ago the game ended by the server's clock, in milliseconds; never below 0. */
function sinceEnded(game: GameRecord, now: number): number {
  const ended = game.finalizedAt === null ? Number.NaN : Date.parse(game.finalizedAt);
  return Number.isNaN(ended) ? Number.POSITIVE_INFINITY : Math.max(0, now - ended);
}

export const reopenTrackedGame = defineCommand({
  name: 'games.reopen_tracked_game',
  permission: 'games.score',
  // `sequence`: the number of the last tap the device knows of, its End game (the
  // tracker holds that, not the game's version): a game that moved on since is refused.
  input: z.object({ gameId: lowerId, sequence: tapSequence, reason: correctionReason }),
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
    if (!isDecided(game.status)) return fail({ code: 'game-not-decided' });
    const saved = await tx.liveGames.findState(game.id);
    if (game.status !== 'final' || saved === undefined) {
      return fail({ code: 'not-ended-by-tracker' });
    }
    if (readState(saved.state).status !== 'final') return fail({ code: 'not-ended-by-tracker' });
    if (saved.seq !== input.sequence) return fail({ code: 'changed-since-read' });
    const corrects = await mayChangeGames(
      context,
      tx,
      'games.correct',
      await gameScope(tx, game.id),
    );
    if (!corrects) {
      const rows = await tx.games.leagueSettingRows(scorekeeperReopenMinutes.key);
      const minutes = lookupSetting(scorekeeperReopenMinutes, rows).value;
      if (minutes === 0) return fail({ code: 'scorekeepers-may-not-reopen' });
      const end = await tx.liveGames.findLastEnd(game.id);
      if (end === undefined || end.accountId !== accountId) {
        return fail({ code: 'not-ended-by-you' });
      }
      if (sinceEnded(game, tx.clock.now()) > minutes * minuteMs) {
        return fail({ code: 'reopen-time-over' });
      }
    }
    const after = await handBackTrackedGame(tx, game, saved, accountId, crypto.randomUUID());
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
