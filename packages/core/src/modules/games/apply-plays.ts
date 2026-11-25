// The one door every play goes through (T6 §1, §3; T-111, T-122): the commands of a
// batch applied in order with the engine, each event saved, then the state, every line
// that changed and the score, in the caller's transaction, with the game's lock already
// taken. The tracker's batches come here (games.apply_tracker_commands), and so do the
// plays an admin's box score grid makes when correcting a tracked game
// (games.correct_tracked_box_score, step 2.65), so there is never a second way of writing
// plays and the event log always explains the final numbers. The body was moved here
// from apply-tracker-commands.ts unchanged; what it does is said there.
import {
  isTablePlayerCommand,
  refusedAddEventType,
  tablePlayerProblems,
  type CommandBatch,
  type CommandResult,
  type TablePlayerInput,
  type TablePlayerProblem,
} from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { engineRulesOf, trackerEngineRulesOf, withoutMercyOrLastMinutes } from './engine-rules.ts';
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
} from './live-game.ts';
import { finishTrackedGame, liveResultOf } from './finish-tracked-game.ts';
import type { GameRecord, NewGameEvent, RefusedAdd, SavedGameState } from './ports.ts';
import { effectiveRulesOf, seasonRulesOf } from './season-rules-of.ts';
import { keptForScoring, tapNotKept } from './statistic-of-tap.ts';
import { applyTablePlayer, tableRefusal, type TableRefusal } from './table-players.ts';

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

type FinishArgs = Parameters<typeof finishTrackedGame>[0];

/** What the door needs: the locked game as read, and what was read of its events. */
export type PlaysToApply = Pick<FinishArgs, 'context' | 'tx' | 'emit'> & {
  readonly game: GameRecord;
  readonly gameId: string;
  readonly saved: SavedGameState | undefined;
  readonly batch: Pick<CommandBatch, 'commands' | 'knownRefusals'>;
  /** The commands' ids in lower case, in the batch's order. */
  readonly ids: readonly string[];
  /** The ids the game already has; the ids taken here are added to it. */
  readonly taken: Set<string>;
  readonly refusedBefore: readonly RefusedAdd[];
  readonly refusedById: ReadonlyMap<string, RefusedAdd>;
  /** The game's last event number. */
  readonly seq: number;
  readonly version: number;
  readonly accountId: string;
  readonly playedWithout: boolean;
};

/** Each command's answer, the game's last event number after them, and the plays refused for a statistic not kept. */
export type PlaysApplied = {
  readonly results: CommandResult[];
  readonly seq: number;
  readonly notKept: Readonly<Record<string, string>>;
};

export async function applyPlays(p: PlaysToApply): Promise<PlaysApplied> {
  const { context, tx, emit, game, gameId, saved, batch, ids, taken, refusedBefore, refusedById } =
    p;
  const { version, accountId, playedWithout } = p;
  let seq = p.seq;
  const now = tx.clock.now();
  const before = saved === undefined ? undefined : readState(saved.state);
  // S-1: until it starts, a game follows the rules it has now: its own, or its
  // season's as they stand. A state holding only line-ups takes them again
  // (withCurrentRules), so a season change before tip-off still reaches it.
  const asSet = await effectiveRulesOf(tx, game);
  // A game brought over from a tracker that had neither rule is played without them,
  // and fixed so when it goes live, so its rules say how it was played (record 062).
  const rules = playedWithout === true ? withoutMercyOrLastMinutes(asSet) : asSet;
  // Such a game also keeps the tracker's way of counting minutes when the clock is set,
  // so its numbers are the tracker's (S-71, record 077); every other game counts them
  // on the game clock.
  const engine = playedWithout === true ? trackerEngineRulesOf(asSet) : engineRulesOf(asSet);
  // Made at time 0, as the Al-Hadi tracker makes its games, so taps queued offline
  // before this batch arrived still run the clock from when they happened.
  let state =
    before === undefined ? basketball.newGame(engine, 0) : withCurrentRules(before, engine);
  const roster = rosterOf(await tx.liveGames.players(gameId));
  // The rosters as the batch found them, for the lines it started with.
  const rosterAtStart = new Map(roster);
  const { uniqueJerseys } = (await seasonRulesOf(tx, game.seasonId)).rosters;
  // S-93 (step 2.241): the statistics the season keeps as they stand, as the public
  // pages count them, not the ones the game kept when it went live: a tap whose
  // statistic the pages would not show is refused, so it is never lost silently.
  const kept = keptForScoring((await tx.games.findSeason(game.seasonId))?.rules);
  // T-391: its own code only to a tracker that reads it; to any other, a game rule.
  const notKeptCode =
    batch.knownRefusals?.includes('statistic-not-kept') === true
      ? ('statistic-not-kept' as const)
      : ('rule' as const);
  /** The statistic of each play refused for not being kept, by command id. */
  const notKept: Record<string, string> = {};
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
    const statistic = tapNotKept(input.type, kept);
    if (statistic !== undefined) {
      notKept[command.commandId] = statistic;
      return {
        commandId: command.commandId,
        status: 'refused',
        reason: { code: notKeptCode, message: '' },
      };
    }
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
  if (events.length === 0) return { results, seq, notKept };

  // T6 §1: the events, the state, every changed line and the score, all together.
  await tx.liveGames.addEvents(events);
  // Changes of players alone are not plays: a game with no state is not given one,
  // so it is not taken for a tracked game (its box score can be entered from paper,
  // and reopening it later keeps that box score). A state it has follows the events.
  if (before === undefined && !played) return { results, seq, notKept };
  await tx.liveGames.saveState(gameId, seq, state);
  if (state.status === 'final') {
    await finishTrackedGame({ context, tx, emit, game, state, rules });
    return { results, seq, notKept };
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
      {
        ...result,
        decided: false,
        overtimePeriods: null,
        ...(fixRules ? { format: rules } : {}),
      },
      game.version,
    );
    // The game is locked and was read after the lock: it cannot have moved on.
    if (updated === undefined) throw new Error('A locked game changed under its batch.');
  }
  return { results, seq, notKept };
}
