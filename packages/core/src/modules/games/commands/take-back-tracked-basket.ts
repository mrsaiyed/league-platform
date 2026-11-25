// Taking back one earlier basket of a tracked game (step 2.247, T-433): a correction
// writes the engine's `unscore` (T-432), naming the basket by its own play ID, through
// the tracker's one door (`apply-plays.ts`) as the grid's save does, so the event log
// still explains the final numbers (T-122). The grid does not call it yet.
import {
  correctionPlaySource,
  trackerProtocolVersion,
  type TrackerCommand,
} from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { z } from 'zod';
import { recordActivity, scopeDetails } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { applyPlays } from '../apply-plays.ts';
import { gameInArchivedSeasonNotReopened } from '../archived-season.ts';
import { isDecided } from '../game-fields.ts';
import { readState } from '../live-game.ts';
import { gameScope, mayChangeGames } from '../policy.ts';
import type { TrackerTx } from '../ports.ts';

export type TakeBackTrackedBasketError =
  | {
      readonly code:
        | 'game-not-found'
        | 'not-allowed'
        | 'changed-since-read'
        | 'not-tracked'
        | 'game-final'
        | 'game-not-live'
        | 'reason-needed';
    }
  /** The engine's own "no" (not a basket of this game, already taken back), in its words. */
  | { readonly code: 'rule'; readonly problem: 'engine'; readonly message: string };

export const takeBackTrackedBasket = defineCommand({
  name: 'games.take_back_tracked_basket',
  permission: 'games.correct',
  refusedInArchivedSeason: gameInArchivedSeasonNotReopened,
  input: z.object({
    gameId: z.uuid(),
    /** The game's last event when the grid was read (games.read_tracked_box_score). */
    sequence: z.number().int().min(0),
    /** The basket's own play ID, as the game's state keeps it: never its place in the list. */
    playId: z.string().min(1).max(99),
  }),
  allowed: async (context, input, tx: TrackerTx) =>
    mayChangeGames(context, tx, 'games.correct', await gameScope(tx, input.gameId)),
  run: async ({
    context,
    input,
    tx,
    emit,
  }): Promise<Result<{ sequence: number }, TakeBackTrackedBasketError>> => {
    const gameId = input.gameId.toLowerCase();
    if (!(await tx.scoringSessions.lockGame(gameId))) return fail({ code: 'game-not-found' });
    const game = await tx.games.find(gameId);
    if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
    const accountId = context.accountId;
    if (accountId === null) return fail({ code: 'not-allowed' });
    const saved = await tx.liveGames.findState(gameId);
    if (saved === undefined || !(await tx.games.hasPlays(gameId))) {
      return fail({ code: 'not-tracked' });
    }
    if (isDecided(game.status)) return fail({ code: 'game-final' });
    if (game.status !== 'live') return fail({ code: 'game-not-live' });
    const [newest] = await tx.games.correctionsNewestFirst(gameId);
    if (newest === undefined || newest.after.status !== 'live') {
      return fail({ code: 'reason-needed' });
    }
    const seq = Math.max(saved.seq, await tx.liveGames.lastEventSeq(gameId));
    if (input.sequence !== seq) return fail({ code: 'changed-since-read' });

    // The basket's side, player and points come from the state, so the play repeats them.
    const state = readState(saved.state);
    const basket = state.plays.find((p) => p.id === input.playId);
    const play: TrackerCommand['input'] =
      basket?.type === 'score'
        ? {
            type: 'unscore',
            side: basket.side,
            playerId: basket.playerId,
            points: basket.points,
            playId: basket.id,
          }
        : // Not a basket of this game: the engine refuses it in its own words.
          { type: 'unscore', side: 'home', playerId: '-', points: 1, playId: input.playId };
    const now = tx.clock.now();
    try {
      basketball.apply(state, play, { id: crypto.randomUUID(), now });
    } catch (thrown) {
      if (!(thrown instanceof basketball.TrackerError)) throw thrown;
      return fail({ code: 'rule', problem: 'engine', message: thrown.message.slice(0, 300) });
    }

    const commands: TrackerCommand[] = [{ commandId: crypto.randomUUID(), at: now, input: play }];
    const ids = commands.map((c) => c.commandId.toLowerCase());
    const refusedBefore = await tx.liveGames.refusedAdds(gameId);
    const applied = await applyPlays({
      context,
      tx,
      emit,
      game,
      gameId,
      saved,
      batch: { commands, knownRefusals: [] },
      ids,
      taken: new Set(await tx.liveGames.takenCommands(gameId, ids)),
      refusedBefore,
      refusedById: new Map(refusedBefore.map((r) => [r.commandId.toLowerCase(), r])),
      seq,
      version: trackerProtocolVersion,
      accountId,
      playedWithout: false,
      // T-408: the play says it came from a correction; only a correction may send it.
      source: correctionPlaySource,
    });
    if (applied.results.some((r) => r.status !== 'accepted')) {
      throw new Error('A basket taken back, judged beforehand, was refused.');
    }
    await recordActivity(tx, context, {
      action: 'games.take_back_tracked_basket',
      target: { type: 'game', id: gameId },
      details: { gameId, playId: input.playId, ...scopeDetails(await gameScope(tx, gameId)) },
    });
    return ok({ sequence: applied.seq });
  },
});
