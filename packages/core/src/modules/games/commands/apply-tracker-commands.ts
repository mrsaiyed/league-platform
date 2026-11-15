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
import {
  buildVersionRefusal,
  CommandBatch,
  CommandBatchV1,
  isAcceptedProtocolVersion,
  isTablePlayerCommand,
  refusedAddEventType,
  tablePlayerProblems,
  type CommandReply,
  type CommandResult,
  type RefusalCode,
  type TablePlayerInput,
  type TablePlayerProblem,
} from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { engineRulesOf } from '../engine-rules.ts';
import {
  changedLines,
  linesOf,
  platformProblem,
  playerKey,
  playerNotOnTeam,
  teamOfSide,
  readState,
  rosterOf,
  scoreOf,
  tieProblem,
  withCurrentRules,
  withLowerIds,
  type TrackerInput,
} from '../live-game.ts';
import { finishTrackedGame, liveResultOf } from '../finish-tracked-game.ts';
import { mayScoreGame } from '../policy.ts';
import type { GameRecord, NewGameEvent, TrackerTx } from '../ports.ts';
import { lowerId, scorerOf, sessionStanding } from '../scoring-session.ts';
import { effectiveRulesOf, seasonRulesOf } from '../season-rules-of.ts';
import { applyTablePlayer, tableRefusal, type TableRefusal } from '../table-players.ts';

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

/**
 * What a change of players keeps as its event: ids and the number, never the typed
 * name (events are never changed, and a name must stay erasable, T-52).
 */
function tableEventPayload(input: TablePlayerInput): Readonly<Record<string, unknown>> {
  const base = { side: input.side, playerId: input.playerId.toLowerCase() };
  switch (input.type) {
    case 'add-player':
      return { ...base, jersey: input.jersey, named: input.name !== '' };
    case 'change-player':
      return {
        ...base,
        ...(input.jersey === undefined ? {} : { jersey: input.jersey }),
        renamed: input.name !== undefined,
      };
    case 'remove-player':
      return base;
  }
}

/** A game the tracker may score: not decided, called off or put off. */
const isPlayable = (game: GameRecord) => game.status === 'scheduled' || game.status === 'live';

const messages: Readonly<Record<Exclude<RefusalCode, 'rule' | 'not-allowed'>, string>> = {
  'session-not-held': 'This device no longer holds the game.',
  'game-not-live': 'This game cannot be scored now.',
  'unknown-game': 'There is no such game.',
};

export const applyTrackerCommands = defineCommand({
  name: 'games.apply_tracker_commands',
  permission: 'games.score',
  // The version is read on its own first: a batch from another version may not match
  // the current shapes at all (ProtocolProbe).
  input: z.looseObject({ gameId: lowerId, protocolVersion: z.number().int().min(1) }),
  allowed: (context, input, tx: TrackerTx) => mayScoreGame(context, tx, input.gameId),
  run: async ({
    context,
    input,
    tx,
    emit,
  }): Promise<Result<CommandReply, ApplyTrackerCommandsError>> => {
    const version = input.protocolVersion;
    const reader = batchReaders[version];
    if (!isAcceptedProtocolVersion(version) || reader === undefined) {
      const refusal = buildVersionRefusal();
      return fail({ code: 'unsupported-protocol-version', accepted: refusal.accepted });
    }
    const { gameId, ...body } = input;
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
    const reply = (sequence: number, results: CommandResult[]): CommandReply => ({
      protocolVersion: version,
      sequence,
      results,
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
    const standing = await sessionStanding(tx, gameId, batch.sessionId.toLowerCase(), accountId);
    if (!standing.held) {
      return ok(reply(seq, refuseAll('session-not-held', messages['session-not-held'], taken)));
    }

    const now = tx.clock.now();
    const before = saved === undefined ? undefined : readState(saved.state);
    // S-1: until it starts, a game follows the rules it has now: its own, or its
    // season's as they stand. A state holding only line-ups takes them again
    // (withCurrentRules), so a season change before tip-off still reaches it.
    const rules = await effectiveRulesOf(tx, game);
    // Made at time 0, as the Al-Hadi tracker makes its games, so taps queued offline
    // before this batch arrived still run the clock from when they happened.
    let state =
      before === undefined
        ? basketball.newGame(engineRulesOf(rules), 0)
        : withCurrentRules(before, engineRulesOf(rules));
    const roster = rosterOf(await tx.liveGames.players(gameId));
    // The rosters as the batch found them, for the lines it started with.
    const rosterAtStart = new Map(roster);
    const { uniqueJerseys } = (await seasonRulesOf(tx, game.seasonId)).rosters;
    const events: NewGameEvent[] = [];
    /** Whether a play was taken: only then is a state saved for a game that has none. */
    let played = false;
    /**
     * Players whose adding was refused, in this batch or one before, and not added since,
     * with the refused command's ID.
     */
    const notAdded = new Map<string, string>(
      refusedBefore.map((r) => [r.playerId.toLowerCase(), r.commandId]),
    );
    /** A refusal of a play or a change of players, said in version 2 only (T-127). */
    const tableReason = (refusal: TableRefusal, more: { playerId?: string; follows?: string }) =>
      version >= 2
        ? {
            code: 'rule' as const,
            message: refusal.message.slice(0, 300),
            problem: refusal.problem,
            ...(refusal.wornBy === undefined ? {} : { wornBy: refusal.wornBy }),
            ...more,
          }
        : { code: 'rule' as const, message: refusal.message.slice(0, 300) };

    const applyOne = async (
      commandId: string,
      command: CommandBatch['commands'][number],
    ): Promise<CommandResult> => {
      if (taken.has(commandId)) return { commandId: command.commandId, status: 'duplicate' };
      const again = refusedById.get(commandId);
      if (again !== undefined) {
        const known = (tablePlayerProblems as readonly string[]).includes(again.problem);
        const problem = known ? (again.problem as TablePlayerProblem) : 'not-saved';
        return {
          commandId: command.commandId,
          status: 'refused',
          reason: tableReason(tableRefusal(problem), {}),
        };
      }
      const refused = (message: string): CommandResult => ({
        commandId: command.commandId,
        status: 'refused',
        reason: { code: 'rule', message: message.slice(0, 300) },
      });
      // A tap that waited out a dropped connection lands where it happened, never later than now.
      const at = Math.min(now, command.at);
      const notAddedRefusal = (playerId: string): CommandResult => ({
        commandId: command.commandId,
        status: 'refused',
        reason: tableReason(tableRefusal('player-not-added'), {
          playerId,
          follows: notAdded.get(playerId) ?? '',
        }),
      });
      if (isTablePlayerCommand(command)) {
        const playerId = command.input.playerId.toLowerCase();
        // An add is always looked at itself: a corrected one may add the player.
        const onTeam = roster.has(playerKey(teamOfSide(game, command.input.side), playerId));
        if (command.input.type !== 'add-player' && !onTeam && notAdded.has(playerId)) {
          return notAddedRefusal(playerId);
        }
        const outcome = await applyTablePlayer({
          context,
          tx,
          game,
          roster,
          state,
          uniqueJerseys,
          linesKept: before === undefined,
          input: command.input,
        });
        if ('refused' in outcome) {
          // The player was never added: every later command naming them says so, in this
          // batch and the ones after it, so the refused add is kept as an event.
          if (command.input.type === 'add-player') {
            notAdded.set(playerId, command.commandId);
            seq += 1;
            events.push({
              gameId,
              seq,
              commandId,
              type: refusedAddEventType,
              payload: { side: command.input.side, playerId, problem: outcome.refused.problem },
              tappedAt: at,
              accountId,
            });
            taken.add(commandId);
          }
          return {
            commandId: command.commandId,
            status: 'refused',
            reason: tableReason(outcome.refused, {}),
          };
        }
        seq += 1;
        const payload = tableEventPayload(command.input);
        events.push({
          gameId,
          seq,
          commandId,
          type: command.input.type,
          payload,
          tappedAt: at,
          accountId,
        });
        taken.add(commandId);
        if (command.input.type === 'add-player') notAdded.delete(playerId);
        const { notice } = outcome.taken;
        return {
          commandId: command.commandId,
          status: 'accepted',
          ...(notice === undefined || version < 2 ? {} : { notice }),
        };
      }
      const input: TrackerInput = withLowerIds(command.input);
      const platform = platformProblem(input);
      if (platform !== undefined) return refused(platform);
      const missing = playerNotOnTeam(game, roster, input);
      if (missing !== undefined && notAdded.has(missing)) return notAddedRefusal(missing);
      if (missing !== undefined) {
        return {
          commandId: command.commandId,
          status: 'refused',
          reason: tableReason(tableRefusal('not-on-team'), { playerId: missing }),
        };
      }
      // platformProblem refuses every rules command; this tells the type checker so.
      if (input.type === 'rules') return refused('The game’s rules come from the league.');
      let next: basketball.GameState;
      try {
        next = basketball.apply(state, input, { id: commandId, now: at });
      } catch (thrown) {
        if (thrown instanceof basketball.TrackerError) return refused(thrown.message);
        throw thrown;
      }
      // The engine's own refusal (nothing recorded, already final) comes first, as in
      // games.end_tracked_game; then a level score the rules do not allow.
      if (input.type === 'end') {
        const score = scoreOf(next);
        if (score.home === score.away && !rules.allowTies) return refused(tieProblem);
      }
      state = next;
      played = true;
      const { type, ...payload } = input;
      seq += 1;
      events.push({ gameId, seq, commandId, type, payload, tappedAt: at, accountId });
      taken.add(commandId);
      return { commandId: command.commandId, status: 'accepted' };
    };
    // One after another: a change of players is written before the commands after it.
    const results: CommandResult[] = [];
    for (const [i, command] of batch.commands.entries()) {
      results.push(await applyOne(ids[i] ?? command.commandId.toLowerCase(), command));
    }
    if (events.length === 0) return ok(reply(seq, results));

    // T6 §1: the events, the state, every changed line and the score, all together.
    await tx.liveGames.addEvents(events);
    // Changes of players alone are not plays: a game with no state is not given one,
    // so it is not taken for a tracked game (its box score can be entered from paper,
    // and reopening it later keeps that box score). A state it has follows the events.
    if (before === undefined && !played) return ok(reply(seq, results));
    await tx.liveGames.saveState(gameId, seq, state);
    if (state.status === 'final') {
      await finishTrackedGame({ context, tx, emit, game, state, rules });
      return ok(reply(seq, results));
    }
    const changed = changedLines(
      before === undefined ? new Map() : linesOf(game, rosterAtStart, before),
      linesOf(game, roster, state),
    );
    if (changed.lines.length > 0 || changed.removed.length > 0) {
      await tx.liveGames.saveLines(gameId, changed.lines, changed.removed);
    }
    const result = liveResultOf(state);
    // The game keeps its rules from the moment it goes live (S-1): the database fixes
    // them then (games_format_fixed_once_started). While only line-ups are in, the
    // game has none of its own, so a season change before tip-off still applies.
    const fixRules = game.format === null && result.status === 'live';
    if (
      fixRules ||
      result.status !== game.status ||
      result.homeScore !== game.homeScore ||
      result.awayScore !== game.awayScore
    ) {
      const updated = await tx.games.setResult(
        gameId,
        { ...result, decided: false, ...(fixRules ? { format: rules } : {}) },
        game.version,
      );
      // The game is locked and was read after the lock: it cannot have moved on.
      if (updated === undefined) throw new Error('A locked game changed under its batch.');
    }
    return ok(reply(seq, results));
  },
});
