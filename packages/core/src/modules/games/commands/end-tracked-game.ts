// Ends a tracked game (step 2.30, T6 §7; P7 §5.4): the same end as the tracker's own
// End game tap, for when it is ended from elsewhere (an admin's page, the Al-Hadi
// transfer). It takes the game's lock (T-111), applies the engine's end to the saved
// state and saves it as an event of the account ending it, then, in the same
// transaction, settles the box score lines, makes the game final with its scores and
// announces it, so standings and season totals follow (finish-tracked-game.ts). All of
// it is saved or none of it. A tie is refused unless the game's rules allow ties
// (P7 §5.6). A game with no tracked plays is decided with record_final_score instead.
import { basketball } from '@srleagues/sports';
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { finishTrackedGame } from '../finish-tracked-game.ts';
import { gameVersion, isDecided } from '../game-fields.ts';
import { readState, scoreOf } from '../live-game.ts';
import { mayScoreGame } from '../policy.ts';
import type { TrackerTx } from '../ports.ts';
import { lowerId, scorerOf } from '../scoring-session.ts';
import { effectiveRulesOf } from '../season-rules-of.ts';

export type EndTrackedGameError = {
  readonly code:
    | 'game-not-found'
    | 'changed-since-read'
    | 'game-already-decided'
    | 'game-cancelled'
    | 'game-not-live'
    | 'not-tracked'
    | 'nothing-recorded'
    | 'tie-not-allowed';
};

export const endTrackedGame = defineCommand({
  name: 'games.end_tracked_game',
  permission: 'games.score',
  input: z.object({ gameId: lowerId, version: gameVersion }),
  // Whoever may score this game, by the league's setting (P4 §4).
  allowed: (context, input, tx: TrackerTx) => mayScoreGame(context, tx, input.gameId),
  run: async ({
    context,
    input,
    tx,
    emit,
  }): Promise<Result<{ version: number }, EndTrackedGameError>> => {
    const accountId = scorerOf(context);
    if (!(await tx.scoringSessions.lockGame(input.gameId))) return fail({ code: 'game-not-found' });
    const game = await tx.games.find(input.gameId);
    if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
    if (game.version !== input.version) return fail({ code: 'changed-since-read' });
    if (isDecided(game.status)) return fail({ code: 'game-already-decided' });
    if (game.status === 'cancelled') return fail({ code: 'game-cancelled' });
    // Only a game its tracker could score: not one put off.
    if (game.status !== 'live' && game.status !== 'scheduled') {
      return fail({ code: 'game-not-live' });
    }
    const saved = await tx.liveGames.findState(game.id);
    if (saved === undefined) return fail({ code: 'not-tracked' });
    const before = readState(saved.state);
    const now = tx.clock.now();
    const commandId = crypto.randomUUID();
    let state: basketball.GameState;
    try {
      state = basketball.apply(before, { type: 'end' }, { id: commandId, now });
    } catch (thrown) {
      // The engine ends only a game with something recorded in it.
      if (thrown instanceof basketball.TrackerError) return fail({ code: 'nothing-recorded' });
      throw thrown;
    }
    const rules = await effectiveRulesOf(tx, game);
    const score = scoreOf(state);
    if (score.home === score.away && !rules.allowTies) return fail({ code: 'tie-not-allowed' });
    const seq = saved.seq + 1;
    await tx.liveGames.addEvents([
      { gameId: game.id, seq, commandId, type: 'end', payload: {}, tappedAt: now, accountId },
    ]);
    await tx.liveGames.saveState(game.id, seq, state);
    const version = await finishTrackedGame({ context, tx, emit, game, state, rules });
    return ok({ version });
  },
});
