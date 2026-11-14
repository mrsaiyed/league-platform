// Leaving the game on this device releases its scoring session (T6 §5), so the game
// is free at once rather than when the lease runs out. Releasing a session that was
// already taken over or released changes nothing and says so; only the account's own
// session can be released.
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayScoreGame } from '../policy.ts';
import type { ScoringTx } from '../ports.ts';
import {
  lowerId,
  scorerOf,
  sessionStanding,
  type ScoringSessionReply,
} from '../scoring-session.ts';

export type ReleaseScoringSessionError = { readonly code: 'game-not-found' };

export const releaseScoringSession = defineCommand({
  name: 'games.release_scoring_session',
  permission: 'games.score',
  input: z.object({ gameId: lowerId, sessionId: lowerId }),
  allowed: (context, input, tx: ScoringTx) => mayScoreGame(context, tx, input.gameId),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<ScoringSessionReply, ReleaseScoringSessionError>> => {
    // The game first, then its session, as every command that writes either does
    // (ScoringSessionsStore.lockGame): a batch of taps in flight finishes first.
    await tx.scoringSessions.lockGame(input.gameId);
    const game = await tx.games.find(input.gameId);
    if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
    const now = tx.clock.now();
    const standing = await sessionStanding(tx, game.id, input.sessionId, scorerOf(context));
    if (!standing.held) return ok({ status: 'ended', reason: standing.reason, sentAt: now });
    await tx.scoringSessions.end(game.id, standing.session.id);
    return ok({ status: 'ended', reason: 'released', sentAt: now });
  },
});
