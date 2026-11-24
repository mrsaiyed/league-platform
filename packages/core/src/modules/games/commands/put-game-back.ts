// Puts a game called off back (P7 §5.6, S-51, S-75; A-5: one wrong tap must not lose a
// game), for whoever may call it off (`games.results`, at the game's program):
//
// - a cancelled game goes back to what it was when it was cancelled: scheduled at its date
//   and time, or postponed and waiting for a new date, as the cancelling's activity entry
//   keeps it (an entry from before that was kept: scheduled);
// - a postponed game goes back on its old date, scheduled (a postponement made by mistake,
//   while no screen can give a new date yet: step 2.53).
//
// Neither ever had a score (only a game not decided is called off), so the standings, which
// never counted it, have nothing to move. A game whose team, division, venue or court is in
// the bin stays called off until that is back (the bin's own rule, as restore_game has it).
// A game called off holds no place on the schedule, so another game may have taken its
// court or one of its teams at that time since: it is put back all the same, and the games
// that hold its place now are named in the answer, for the screen to say at once (the
// admin decides; the publish preview lists the clash too).
//
// Why is chosen from a fixed list and kept in the activity log with who did it (A-6), and
// what the game was and is now: the log keeps ids and fixed words only (0004). The game's
// events (line-ups a scorer's table set) are left as they are: the event log is never
// edited (T3).
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { gameVersion } from '../game-fields.ts';
import { gameScope, mayChangeGames } from '../policy.ts';
import type { GameAtSameTime, GamesTx } from '../ports.ts';
import { gameInArchivedSeason } from '../archived-season.ts';

/** Why a game called off is put back, from a fixed list: the screen picks the words. */
export const putBackReasons = ['cancelledByMistake', 'willBePlayed', 'wrongGame', 'other'] as const;
export type PutBackReason = (typeof putBackReasons)[number];

export type PutGameBackError = {
  readonly code:
    | 'game-not-found'
    | 'changed-since-read'
    | 'game-not-called-off'
    | 'game-part-in-bin';
};

export type PutGameBack = {
  readonly version: number;
  /** What the game is now: scheduled at its date, or postponed and waiting for a new one. */
  readonly status: 'scheduled' | 'postponed';
  /** The games that hold its place at that time now (none for a postponed game). */
  readonly clashes: readonly GameAtSameTime[];
};

export const putGameBack = defineCommand({
  name: 'games.put_game_back',
  permission: 'games.results',
  refusedInArchivedSeason: gameInArchivedSeason,
  input: z.object({
    gameId: z.uuid(),
    version: gameVersion,
    reason: z.enum(putBackReasons),
  }),
  // Whoever may call it off (S-51): the same check as games.cancel_game and postpone_game.
  allowed: async (context, input, tx: GamesTx) =>
    mayChangeGames(context, tx, 'games.results', await gameScope(tx, input.gameId)),
  run: async ({ context, input, tx }): Promise<Result<PutGameBack, PutGameBackError>> => {
    const game = await tx.games.find(input.gameId);
    if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
    if (game.version !== input.version) return fail({ code: 'changed-since-read' });
    if (game.status !== 'cancelled' && game.status !== 'postponed') {
      return fail({ code: 'game-not-called-off' });
    }
    if (await tx.games.partInBin(game.id)) return fail({ code: 'game-part-in-bin' });
    const status =
      game.status === 'cancelled' && (await tx.games.statusBeforeCancelled(game.id)) === 'postponed'
        ? 'postponed'
        : 'scheduled';
    const updated = await tx.games.setResult(
      game.id,
      { status, homeScore: null, awayScore: null, decided: false, overtimePeriods: null },
      input.version,
    );
    if (updated === undefined) return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'games.put_game_back',
      target: { type: 'game', id: game.id },
      details: { reason: input.reason, was: game.status, now: status },
    });
    const clashes = status === 'scheduled' ? await tx.games.clashesOf(game.id) : [];
    return ok({ version: updated, status, clashes });
  },
});
