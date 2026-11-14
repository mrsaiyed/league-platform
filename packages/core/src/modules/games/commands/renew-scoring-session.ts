// Renews this device's scoring session (T-116): the tracker calls it every half
// minute while it is open, and the lease runs on for another two minutes. A session
// whose lease ran out while the device was offline, but which nobody has taken,
// carries on (record 036). A session that was taken over or released is answered
// "ended", and the tracker turns read-only and says why (T6 §5). Who may score is
// read fresh each time (T-75): a scorekeeper taken off the game cannot renew, so the
// lease runs out. A game decided or cancelled while the tracker was open is refused,
// so the tracker turns read-only; the lease then runs out by itself, and reopening
// the game for a correction (S-7) lets the device open it again.
import { z } from 'zod';
import { defineCommand, ok, type Result } from '../../../command/index.ts';
import { mayScoreGame } from '../policy.ts';
import type { ScoringTx } from '../ports.ts';
import {
  keepSession,
  lowerId,
  scorableGame,
  scorerOf,
  sessionStanding,
  type ScorableGameError,
  type ScoringSessionReply,
} from '../scoring-session.ts';

export type RenewScoringSessionError = ScorableGameError;

export const renewScoringSession = defineCommand({
  name: 'games.renew_scoring_session',
  permission: 'games.score',
  input: z.object({ gameId: lowerId, sessionId: lowerId }),
  allowed: (context, input, tx: ScoringTx) => mayScoreGame(context, tx, input.gameId),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<ScoringSessionReply, RenewScoringSessionError>> => {
    const game = await scorableGame(tx, input.gameId);
    if (!game.ok) return game;
    const now = tx.clock.now();
    const standing = await sessionStanding(tx, game.value, input.sessionId, scorerOf(context));
    if (!standing.held) return ok({ status: 'ended', reason: standing.reason, sentAt: now });
    const kept = await keepSession(tx, standing.session, now);
    // Ended by another request between reading it and renewing it.
    return ok(
      kept.status === 'held-by-other'
        ? { status: 'ended', reason: 'taken-over', sentAt: now }
        : kept,
    );
  },
});
