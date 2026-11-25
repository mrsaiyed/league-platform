// The server half of the tracker (T6 §1, §3; T-110 to T-113, T-127; S-1, S-5). The
// tracker sends its taps a few at a time; this takes a lock on that one game (T-111),
// so batches for one game go one after another while every other game goes on
// (T-112), and applies each command in order with the engine from packages/sports,
// as the Al-Hadi tracker's server does. In this one transaction it saves an event per
// command taken, the new state, the score on the game and every box score line that
// changed (T6 §1). Each command is answered:
//
// - duplicate: the game already has its ID, so a retry or a replayed queue counts
//   nothing twice (T3 §12, T-129). Checked first, so a device whose answer was lost
//   learns its taps were saved even after the game was taken from it;
// - refused, with the reason (T-113): the session no longer holds the game (T-116),
//   the game is not one that can be scored, a player not on that team, or the
//   engine's own "no" (a foul on a player not on the floor). The tracker reloads the
//   server's state, which is the truth. A refused command does not stop the rest of
//   the batch: each is judged against the state the commands before it left;
// - accepted.
//
// Starting a game turns its rules into the engine's: its own if it was given some,
// otherwise its season's. Until the game goes live (line-ups only) it follows them as
// they stand; from then on it keeps them (S-1), so a later change to the season's
// rules leaves it alone. The tracker's protocol version is read before
// anything else: the current one and the one before it are taken (T-127).
//
// The End game tap ends the game in this same transaction (step 2.30, T6 §7): the
// lines are settled, the game is final with its scores, and standings follow
// (finish-tracked-game.ts). A tie is refused unless the game's rules allow ties. Taps
// after it in the batch meet the engine's own "this game is final". Reopening is not
// a tap: it needs a reason and the permission to correct games (games.reopen_game).
//
// Since version 2 (record 058, T-261) a batch also carries the players the scorer's
// table adds, changes and takes off, in order with the taps. Each is handled before
// the engine, which never sees it (table-players.ts), and is kept as one of the game's
// events, so a retry is a duplicate like any tap and a player added offline is on the
// team before the plays after it that name them. Its event keeps ids and the number
// only, never the typed name: events are never changed, and a name must stay
// erasable (T-52). The lines a batch started with are worked out from the rosters as
// they were then, so a number changed in the batch is written to the lines it reaches.
//
// A play of a statistic the season does not keep (a turnover in a season keeping the
// standard set) is refused, about that tap alone (S-93, step 2.241, T-391): the tracker
// sets it aside, lists it and sends the rest. The refusal carries no sentence: the
// statistic it names is plain data beside the reply (`notKept`), and the server words it
// from its message files (T-187) before the reply goes out.
//
// The applying itself, from the engine to the saved lines and score, is apply-plays.ts:
// the one door, which an admin's box score grid on a tracked game goes through too
// (games.correct_tracked_box_score, step 2.65, T-122).
import {
  buildVersionRefusal,
  CommandBatch,
  CommandBatchV1,
  isAcceptedProtocolVersion,
  type CommandReply,
  type CommandResult,
  type RefusalCode,
} from '@srleagues/contracts';
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { explainedUpTo } from '../game-moved-since.ts';
import { gameScope, mayChangeGames, mayScoreGame } from '../policy.ts';
import { recordActivity, scopeDetails } from '../../access/index.ts';
import type { GameRecord, TrackerTx } from '../ports.ts';
import { lowerId, scorerOf, sessionStanding } from '../scoring-session.ts';
import { gameInArchivedSeasonNotReopened } from '../archived-season.ts';
import { applyPlays } from '../apply-plays.ts';

/**
 * The reply, and the statistic each play refused for not being kept names, by command
 * id: there only when some play was. Not the tracker's: the server words those refusals
 * and sends the reply without it.
 */
export type TrackerCommandsApplied = CommandReply & {
  readonly notKept?: Readonly<Record<string, string>>;
};

export type ApplyTrackerCommandsError =
  | { readonly code: 'unsupported-protocol-version'; readonly accepted: readonly number[] }
  | {
      readonly code: 'invalid-input';
      readonly issues: readonly { readonly path: string; readonly problem: string }[];
    };

/**
 * How each protocol version's batch is read, into the current shape (T-127). When
 * `trackerProtocolVersion` goes up, the previous version's schema stays here, with
 * what turns it into the current batch; a test fails if an accepted version has none.
 * Version 1 is taps only: each of its batches is already a version 2 batch.
 */
export const batchReaders: Readonly<Record<number, z.ZodType<CommandBatch>>> = {
  1: CommandBatchV1,
  2: CommandBatch,
};

/** A game the tracker may score: not decided, called off or put off. */
const isPlayable = (game: GameRecord) => game.status === 'scheduled' || game.status === 'live';

const messages: Readonly<
  Record<Exclude<RefusalCode, 'rule' | 'not-allowed' | 'statistic-not-kept'>, string>
> = {
  'session-not-held': 'This device no longer holds the game.',
  'game-not-live': 'This game cannot be scored now.',
  'unknown-game': 'There is no such game.',
  'game-moved': 'Something was recorded in this game since these plays were made.',
};

export const applyTrackerCommands = defineCommand({
  name: 'games.apply_tracker_commands',
  permission: 'games.score',
  refusedInArchivedSeason: gameInArchivedSeasonNotReopened,
  // The version is read on its own first: a batch from another version may not match
  // the current shapes at all (ProtocolProbe).
  input: z.looseObject({
    gameId: lowerId,
    protocolVersion: z.number().int().min(1),
    /**
     * Not a tracker's (the endpoint refuses it): the game was played on a tracker with
     * no mercy rule and no last-minutes stop clock, and is brought over here (the
     * transfer, step 2.58), so it is played and kept without them (record 062). Only
     * for whoever may also correct the game.
     */
    withoutMercyOrLastMinutes: z.literal(true).optional(),
  }),
  allowed: async (context, input, tx: TrackerTx) =>
    (await mayScoreGame(context, tx, input.gameId)) &&
    (input.withoutMercyOrLastMinutes !== true ||
      (await mayChangeGames(context, tx, 'games.correct', await gameScope(tx, input.gameId)))),
  run: async ({
    context,
    input,
    tx,
    emit,
  }): Promise<Result<TrackerCommandsApplied, ApplyTrackerCommandsError>> => {
    const version = input.protocolVersion;
    const reader = batchReaders[version];
    if (!isAcceptedProtocolVersion(version) || reader === undefined) {
      const refusal = buildVersionRefusal();
      return fail({ code: 'unsupported-protocol-version', accepted: refusal.accepted });
    }
    const { gameId, withoutMercyOrLastMinutes: playedWithout, ...body } = input;
    const parsed = reader.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        problem: issue.code,
      }));
      return fail({ code: 'invalid-input', issues });
    }
    const batch = parsed.data;
    const accountId = scorerOf(context);
    const ids = batch.commands.map((c) => c.commandId.toLowerCase());
    const reply = (
      sequence: number,
      results: CommandResult[],
      notKept: Readonly<Record<string, string>> = {},
    ): TrackerCommandsApplied => ({
      protocolVersion: version,
      sequence,
      results,
      ...(Object.keys(notKept).length === 0 ? {} : { notKept }),
    });
    const refuseAll = (code: RefusalCode, message: string, taken: ReadonlySet<string>) =>
      batch.commands.map(
        (c, i): CommandResult =>
          taken.has(ids[i] ?? '')
            ? { commandId: c.commandId, status: 'duplicate' }
            : { commandId: c.commandId, status: 'refused', reason: { code, message } },
      );

    // T-111: this game only, held to the end of the transaction.
    if (!(await tx.scoringSessions.lockGame(gameId))) {
      return ok(reply(0, refuseAll('unknown-game', messages['unknown-game'], new Set())));
    }
    const game = await tx.games.find(gameId);
    if (game === undefined || game.binned) {
      return ok(reply(0, refuseAll('unknown-game', messages['unknown-game'], new Set())));
    }
    const saved = await tx.liveGames.findState(gameId);
    const taken = new Set(await tx.liveGames.takenCommands(gameId, ids));
    // Adds refused before are kept as events (record 058): answered again the same way,
    // never as duplicates, and still named by the commands that name their player.
    const refusedBefore = await tx.liveGames.refusedAdds(gameId);
    const refusedById = new Map(refusedBefore.map((r) => [r.commandId.toLowerCase(), r]));
    for (const id of refusedById.keys()) taken.delete(id);
    // The last event, whether a play or a change of players: a batch of changes only
    // saves no state (below), so the state's own number can be behind the events'.
    let seq = Math.max(saved?.seq ?? 0, await tx.liveGames.lastEventSeq(gameId));
    if (!isPlayable(game)) {
      return ok(reply(seq, refuseAll('game-not-live', messages['game-not-live'], taken)));
    }
    // The device says whose taps these are (T-327): only the session's own account's are
    // taken. The stated maker can only refuse a batch, never let one in.
    const otherMaker =
      batch.accountId !== undefined && batch.accountId.toLowerCase() !== accountId.toLowerCase();
    const namedSession = batch.sessionId.toLowerCase();
    /**
     * Where the answer is written down (T-335): the holding session is heard at it; a lost
     * session's kept plays, once some were taken, were sent up to it.
     */
    let noteAnswer: (() => Promise<void>) | undefined;
    if (batch.notSavedSince === undefined) {
      const standing = await sessionStanding(tx, gameId, namedSession, accountId);
      if (!standing.held || otherMaker) {
        return ok(reply(seq, refuseAll('session-not-held', messages['session-not-held'], taken)));
      }
      noteAnswer = () => tx.scoringSessions.heard(gameId, namedSession, seq);
    } else {
      // "Send these plays" (S-43, T-335): the scorekeeper's own tap, whoever holds the
      // game now, taken only from the account whose session the game was taken from
      // (the server keeps it, 0027), and only if the game has not moved since the server
      // last answered that session. All of it under this game's lock (above), so no
      // batch or takeover of this game can come between the check and the write.
      if (otherMaker) {
        return ok(reply(seq, refuseAll('session-not-held', messages['session-not-held'], taken)));
      }
      const lost = await tx.scoringSessions.findLost(gameId, namedSession);
      const since = batch.notSavedSince;
      const explained =
        lost === undefined || lost.accountId.toLowerCase() !== accountId.toLowerCase()
          ? null
          : await explainedUpTo(tx, {
              gameId,
              since,
              last: seq,
              own: new Set(ids),
              accountId,
              heard: lost.heardSeq,
              ...(lost.sentSeq === undefined ? {} : { sent: lost.sentSeq }),
            });
      if (explained !== seq) {
        // T-372: a list longer than a batch (a whole game's copy uploaded) is explained
        // batch by batch. How far this batch explains the events, in order, is written as
        // sent, so the next batch looks past it; its plays already there answer
        // duplicate (they add nothing), and any other is refused, to enter again.
        if (lost !== undefined && explained !== null && explained > (lost.sentSeq ?? since)) {
          await tx.scoringSessions.sent(gameId, namedSession, explained);
        }
        return ok(reply(seq, refuseAll('game-moved', messages['game-moved'], taken)));
      }
      const seqBefore = seq;
      const sentBefore = lost?.sentSeq ?? since;
      noteAnswer = async () => {
        // Explained up to here, whether this batch added plays or only answered
        // duplicates (T-372): the list's next batch looks past it.
        if (seq > sentBefore) await tx.scoringSessions.sent(gameId, namedSession, seq);
        if (seq === seqBefore) return;
        // Written as what it is (T-335): plays kept after a takeover, sent by their maker.
        await recordActivity(tx, context, {
          action: 'games.apply_tracker_commands',
          target: { type: 'game', id: gameId },
          details: {
            gameId,
            change: 'sent-after-takeover',
            events: seq - seqBefore,
            ...scopeDetails(await gameScope(tx, gameId)),
          },
        });
      };
    }
    /** Every answer from here on: written down first, in this same transaction. */
    /** Every answer from here on: written down first, in this same transaction. */
    const answer = async (results: CommandResult[], notKept: Readonly<Record<string, string>>) => {
      await noteAnswer?.();
      return ok(reply(seq, results, notKept));
    };
    const applied = await applyPlays({
      context,
      tx,
      emit,
      game,
      gameId,
      saved,
      batch,
      ids,
      taken,
      refusedBefore,
      refusedById,
      seq,
      version,
      accountId,
      playedWithout: playedWithout === true,
    });
    seq = applied.seq;
    return answer(applied.results, applied.notKept);
  },
});
