// Takes over scoring a game from the device that holds it (T6 §5, S-5, T-116), once
// the scorekeeper has confirmed. The holder's session ends and a new one starts in
// the same transaction, so the first device's commands are refused from then on and
// it turns read-only. The scorekeeper confirmed taking it from one holder: if the
// game has changed hands since (`expectedHolderSince` no longer matches), nothing is
// taken and the new holder is shown, to confirm again. A game that is free by then
// is simply opened. A takeover is written to the activity log (A-6).
import { z } from 'zod';
import { defineCommand, ok, type Result } from '../../../command/index.ts';
import { recordActivity, scopeDetails } from '../../access/index.ts';
import { gameScope, mayScoreGame } from '../policy.ts';
import type { ScoringTx } from '../ports.ts';
import {
  claimGame,
  deviceIdField,
  hasLapsed,
  heldByOther,
  isOwnSession,
  lowerId,
  openFor,
  scorableGame,
  scorerOf,
  type ScorableGameError,
  type ScoringSessionReply,
} from '../scoring-session.ts';

export type TakeOverScoringError = ScorableGameError;

export const takeOverScoring = defineCommand({
  name: 'games.take_over_scoring',
  permission: 'games.score',
  input: z.object({
    gameId: lowerId,
    deviceId: deviceIdField,
    confirmed: z.literal(true),
    /** The `since` of the holder the scorekeeper was shown. */
    expectedHolderSince: z.number().int().nonnegative(),
  }),
  allowed: (context, input, tx: ScoringTx) => mayScoreGame(context, tx, input.gameId),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<ScoringSessionReply, TakeOverScoringError>> => {
    const game = await scorableGame(tx, input.gameId);
    if (!game.ok) return game;
    const gameId = game.value;
    const device = { accountId: scorerOf(context), deviceId: input.deviceId };
    const now = tx.clock.now();
    const current = await tx.scoringSessions.findForGame(gameId);
    // Free, lapsed or already this device's: the same as opening it.
    if (current === undefined || hasLapsed(current, now) || isOwnSession(current, device)) {
      return ok(await openFor(tx, gameId, device, now));
    }
    if (current.since !== input.expectedHolderSince) return ok(heldByOther(current, now));
    // Another request may have ended it a moment ago (a takeover of its own, or the
    // holder leaving): then this one displaced nobody, and logs nothing.
    const displaced = await tx.scoringSessions.end(gameId, current.id);
    const reply = await claimGame(tx, gameId, device, now);
    if (displaced && reply.status === 'held-by-you') {
      await recordActivity(tx, context, {
        action: 'games.take_over_scoring',
        target: { type: 'game', id: gameId },
        details: {
          takenFromAccountId: current.accountId,
          ...scopeDetails(await gameScope(tx, gameId)),
        },
      });
    }
    return ok(reply);
  },
});
