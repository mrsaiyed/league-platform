// The game as the tracker's engine holds it on the server (T6 §1, §3; T-113; record
// 041, T-253): the saved state and its sequence number, for a scorekeeper's device to
// load when it opens the game and to reload when the server refused a tap. The server's
// record is the truth; the device rebuilds its screen on top of it.
//
// It answers with the very state the next batch would start from in
// games.apply_tracker_commands: the saved one, given the game's rules as they stand
// while it holds only line-ups (S-1), or a new game under those rules, made at time 0,
// when nothing has been tapped yet. So a device that applies its waiting taps to this
// state gets what the server will get.
//
// It is a staff read, not the visitor's snapshot (record 039): the engine's state names
// every player by id, a team that shows its numbers to staff only included. Only whoever
// may score the game may read it (`games.score`, mayScoreGame, read fresh, T-75). It
// changes nothing, but runs in the same shape as a command (record 014).
import { basketball } from '@srleagues/sports';
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { engineRulesOf } from '../engine-rules.ts';
import { readState, withCurrentRules } from '../live-game.ts';
import { mayScoreGame } from '../policy.ts';
import type { TrackerTx } from '../ports.ts';
import { lowerId } from '../scoring-session.ts';
import { effectiveRulesOf } from '../season-rules-of.ts';

/** The engine's state on the server, and the sequence number of the last tap in it. */
export type TrackerGameState = {
  /** 0 while nothing has been tapped. */
  readonly sequence: number;
  readonly state: basketball.GameState;
};

export type ReadTrackerStateError = { readonly code: 'game-not-found' };

export const readTrackerState = defineCommand({
  name: 'games.read_tracker_state',
  permission: 'games.score',
  input: z.object({ gameId: lowerId }),
  allowed: (context, input, tx: TrackerTx) => mayScoreGame(context, tx, input.gameId),
  run: async ({ input, tx }): Promise<Result<TrackerGameState, ReadTrackerStateError>> => {
    const game = await tx.games.find(input.gameId);
    if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
    const saved = await tx.liveGames.findState(input.gameId);
    const rules = engineRulesOf(await effectiveRulesOf(tx, game));
    const state =
      saved === undefined
        ? basketball.newGame(rules, 0)
        : withCurrentRules(readState(saved.state), rules);
    return ok({ sequence: saved?.seq ?? 0, state });
  },
});
