// Opens a game to score on this device (T6 §5, T-116): takes the scoring session if
// the game is free, carries on with this device's own session if it has one, or says
// who holds the game so the tracker can offer to take over. Two devices opening at
// the same moment: one gets the session, the other is told who has it.
import { z } from 'zod';
import { defineCommand, ok, type Result } from '../../../command/index.ts';
import { mayScoreGame } from '../policy.ts';
import type { ScoringTx } from '../ports.ts';
import {
  deviceIdField,
  lowerId,
  openFor,
  scorableGame,
  scorerOf,
  type ScorableGameError,
  type ScoringSessionReply,
} from '../scoring-session.ts';

export type OpenScoringSessionError = ScorableGameError;

export const openScoringSession = defineCommand({
  name: 'games.open_scoring_session',
  permission: 'games.score',
  input: z.object({ gameId: lowerId, deviceId: deviceIdField }),
  allowed: (context, input, tx: ScoringTx) => mayScoreGame(context, tx, input.gameId),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<ScoringSessionReply, OpenScoringSessionError>> => {
    // The game first, then its session, as every command that writes either does
    // (ScoringSessionsStore.lockGame): a batch of taps in flight finishes first.
    await tx.scoringSessions.lockGame(input.gameId);
    const game = await scorableGame(tx, input.gameId);
    if (!game.ok) return game;
    const device = { accountId: scorerOf(context), deviceId: input.deviceId };
    return ok(await openFor(tx, game.value, device, tx.clock.now()));
  },
});
