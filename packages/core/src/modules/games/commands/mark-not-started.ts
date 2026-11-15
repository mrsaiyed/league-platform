// Marks a game that went live by mistake "not started" (step 2.121; P7 §5.2 and §5.5;
// S-40, S-7, A-5, A-6; record 061, T-264). For a scorekeeper who started the wrong
// game, or was only trying the tracker: the game is scheduled again, its score and
// lines are gone, the public page stops saying Live and its rules are its season's
// again (S-1 does not apply: it was never played).
//
// Who may (S-40): whoever may score the game, while its present state holds nothing but
// lineups and clock taps (recorded-plays.ts draws the line); once it holds a basket, a
// foul or a turnover, only someone who may correct games, with a reason. The game's
// lock is taken before that is decided (T-111), so the plays judged are the plays
// cleared: a batch saved a moment earlier is in them, one sent a moment later waits.
//
// Nothing is edited or removed from the event log (T3: every tap, never edited): a
// `reset` event, the engine's own command, is added after the cleared plays, naming the
// last of them, and the saved state starts again from it, with the season's rules as
// they stand. So every later read starts from that event and nothing before it is ever
// replayed into the new start, while the log still shows everything that was cleared.
//
// The game's scoring session ends with it, so another device's waiting taps meet the
// server's own "this device no longer holds the game" and are listed there as not
// saved; the device that marked it opens the game again like any other (T-116). While
// another account's device holds the game with its lease running, it is refused, as
// ending is (record 038): that device may still be scoring. Written to the activity log
// with who, and the reason when one is given. Standings never counted a game that was
// only live, so nothing else moves.
import { basketball } from '@srleagues/sports';
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import {
  defineCommand,
  fail,
  ok,
  type CommandContext,
  type Result,
} from '../../../command/index.ts';
import { engineRulesOf } from '../engine-rules.ts';
import { correctionReason, isDecided } from '../game-fields.ts';
import { readState, withCurrentRules } from '../live-game.ts';
import { gameScope, mayChangeGames, mayScoreGame } from '../policy.ts';
import type { GameRecord, TrackerTx } from '../ports.ts';
import { holdsRecordedPlays } from '../recorded-plays.ts';
import { hasLapsed, lowerId, scorerOf } from '../scoring-session.ts';
import { seasonRulesOf } from '../season-rules-of.ts';

export type MarkNotStartedError = {
  readonly code:
    | 'game-not-found'
    | 'changed-since-read'
    | 'game-not-started'
    | 'game-final'
    | 'entered-by-hand'
    | 'game-postponed'
    | 'game-cancelled'
    | 'not-tracked'
    | 'session-held'
    | 'reason-needed';
};

/**
 * May this account mark the game not started? It takes the game's lock and reads its
 * plays first, so the line of S-40 is judged on the state the command clears. A game
 * that is not here is checked as scoring is, league-wide.
 */
async function mayMarkNotStarted(
  context: CommandContext,
  tx: TrackerTx,
  gameId: string,
): Promise<boolean> {
  if (await tx.scoringSessions.lockGame(gameId)) {
    const saved = await tx.liveGames.findState(gameId);
    if (saved !== undefined && holdsRecordedPlays(readState(saved.state))) {
      return mayChangeGames(context, tx, 'games.correct', await gameScope(tx, gameId));
    }
  }
  return mayScoreGame(context, tx, gameId);
}

/** Why a game that is not live cannot be marked not started. */
function notLiveProblem(game: GameRecord, tracked: boolean): MarkNotStartedError | undefined {
  if (isDecided(game.status)) {
    // A final score, a box score or a forfeit entered by hand was never on the tracker.
    const byTracker = tracked && game.status === 'final' && game.captureMode === 'live';
    return { code: byTracker ? 'game-final' : 'entered-by-hand' };
  }
  if (game.status === 'postponed') return { code: 'game-postponed' };
  if (game.status === 'cancelled') return { code: 'game-cancelled' };
  if (game.status !== 'live') return { code: 'game-not-started' };
  return undefined;
}

export const markNotStarted = defineCommand({
  name: 'games.mark_not_started',
  // Whoever may score the game; with plays recorded, `games.correct` (S-40).
  permission: 'games.score',
  input: z.object({
    gameId: lowerId,
    /** The sequence number of the last play the asker has seen (the tracker's state's). */
    sequence: z.number().int().min(0),
    /** Why: needed once a basket, foul or turnover is recorded (S-40, S-7). */
    reason: correctionReason.optional(),
  }),
  allowed: (context, input, tx: TrackerTx) => mayMarkNotStarted(context, tx, input.gameId),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ sequence: number; version: number }, MarkNotStartedError>> => {
    const accountId = scorerOf(context);
    if (!(await tx.scoringSessions.lockGame(input.gameId))) return fail({ code: 'game-not-found' });
    const game = await tx.games.find(input.gameId);
    if (game === undefined || game.binned) return fail({ code: 'game-not-found' });
    const saved = await tx.liveGames.findState(game.id);
    const problem = notLiveProblem(game, saved !== undefined);
    if (problem !== undefined) return fail(problem);
    if (saved === undefined) return fail({ code: 'not-tracked' });
    if (saved.seq !== input.sequence) return fail({ code: 'changed-since-read' });
    const now = tx.clock.now();
    // Read as take_over_scoring reads it: a lapsed session holds nothing.
    const session = await tx.scoringSessions.findForGame(game.id);
    if (session !== undefined && !hasLapsed(session, now) && session.accountId !== accountId) {
      return fail({ code: 'session-held' });
    }
    const before = readState(saved.state);
    if (holdsRecordedPlays(before) && input.reason === undefined) {
      return fail({ code: 'reason-needed' });
    }

    // The engine's own reset, then the season's rules as they stand (S-1 does not
    // apply to a game never played): what the next batch would make of it anyway.
    const commandId = crypto.randomUUID();
    const seasonRules = engineRulesOf(await seasonRulesOf(tx, game.seasonId));
    const state = withCurrentRules(
      basketball.apply(before, { type: 'reset' }, { id: commandId, now }),
      seasonRules,
    );
    const sequence = saved.seq + 1;
    await tx.liveGames.addEvents([
      {
        gameId: game.id,
        seq: sequence,
        commandId,
        type: 'reset',
        payload: { clearedThrough: saved.seq },
        tappedAt: now,
        accountId,
      },
    ]);
    await tx.liveGames.saveState(game.id, sequence, state);
    const lines = await tx.liveGames.lines(game.id);
    if (lines.length > 0) {
      await tx.liveGames.saveLines(
        game.id,
        [],
        lines.map((line) => line.personId),
      );
    }
    const version = await tx.games.markNotStarted(game.id, game.version);
    // The game is locked and was read after the lock: it cannot have moved on.
    if (version === undefined) throw new Error('A locked game changed while it was cleared.');
    if (session !== undefined) await tx.scoringSessions.end(game.id, session.id);
    await recordActivity(tx, context, {
      action: 'games.mark_not_started',
      target: { type: 'game', id: game.id },
      details: {
        clearedThrough: saved.seq,
        ...(input.reason === undefined ? {} : { reason: input.reason }),
      },
    });
    return ok({ sequence, version });
  },
});
