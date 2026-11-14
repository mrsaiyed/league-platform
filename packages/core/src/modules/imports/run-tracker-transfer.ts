// Carries out a transfer plan (plan-tracker-transfer.ts, step 2.58), only through the
// product's own commands, each its own transaction: people are added with
// people.create_person and put on their team's roster with their numbers
// (teams.add_to_roster), and one the plan found in the league's list on no roster (a
// run cut off between the two) is only put on the roster; each game is opened to score on one device
// (games.open_scoring_session), its actions are sent a few at a time through the
// tracker's door (games.apply_tracker_commands), which ends the game when it meets the
// tracker's own End game, settles its lines and works out the standings (T6 §7); a game
// the tracker reopened is reopened between its parts with games.reopen_game. The
// tracker's own action ids are kept, so a run that stopped part-way picks up where it
// was, and a second run is told every action is a duplicate and changes nothing (T-137).
//
// After each game it must be final here with the tracker's score and its box score lines
// are compared with the tracker's; the run stops at the first difference, at any action
// the door refuses, or at any command that says no, with what it was. The scoring
// session it held is let go however a game's sending ends. A game transferred before is
// only compared again.
import { maxCommandsPerBatch, trackerProtocolVersion } from '@srleagues/contracts';
import type { CommandContext, CommandDeps } from '../../command/index.ts';
import {
  applyTrackerCommands,
  openScoringSession,
  releaseScoringSession,
  reopenGame,
  type TrackerTx,
} from '../games/index.ts';
import { createPerson, type PeopleTx } from '../people/index.ts';
import { addToRoster, type TeamsTx } from '../teams/index.ts';
import { isToAdd, type PlanOptions, type TransferPlan } from './plan-tracker-transfer.ts';
import { compareLines, type ComparableLine, type LineDifference } from './tracker-lines.ts';
import { withPeople, type Replay, type ReplayStep } from './tracker-replay.ts';
import type {
  PlatformGameFact,
  TrackerGame,
  TrackerTransferReads,
} from './tracker-transfer-data.ts';
import { transferReopenReason } from './tracker-transfer-words.ts';

/** Everything the transfer's commands need in their transaction. */
export type TrackerTransferTx = TrackerTx & PeopleTx & TeamsTx;

/** The device the transfer scores on, as a scoring session names it (T-116). */
export const transferDeviceId = 'tracker-transfer';

export type TransferStop =
  | { readonly kind: 'not-ready' }
  | { readonly kind: 'person-not-added'; readonly playerId: string; readonly code: string }
  | { readonly kind: 'not-opened'; readonly code: string }
  | { readonly kind: 'reopen-refused'; readonly code: string }
  | { readonly kind: 'not-sent'; readonly code: string }
  | { readonly kind: 'action-refused'; readonly seq: number; readonly message: string }
  /** The scoring session the run held could not be let go (it lapses by itself). */
  | { readonly kind: 'not-released'; readonly code: string }
  /** After its actions, the game here is not final with the tracker's score. */
  | {
      readonly kind: 'result-differs';
      readonly status: string;
      readonly here: { readonly home: number | null; readonly away: number | null };
      readonly tracker: { readonly home: number; readonly away: number };
    }
  | { readonly kind: 'lines-differ'; readonly differences: readonly LineDifference[] };

export type TransferReport = {
  /** People added, by tracker player id. */
  readonly added: readonly string[];
  /** Tracker games transferred now, with how many actions were sent for each. */
  readonly transferred: readonly { readonly trackerGameId: string; readonly sent: number }[];
  /** Tracker games already here, whose lines were compared again. */
  readonly checked: readonly string[];
  /**
   * The tracked team's players not brought over, as the plan lists them (`notBroughtOver`):
   * the run went through without them, but they are still to be put on the roster.
   */
  readonly notBroughtOver: readonly string[];
  /** Where the run stopped and why, or null when it went through. */
  readonly stopped: { readonly trackerGameId: string | null; readonly stop: TransferStop } | null;
};

const isDecided = (status: string) => status === 'final' || status === 'forfeit';
const lower = (id: string) => id.toLowerCase();

type Args<Tx extends TrackerTransferTx> = {
  readonly context: CommandContext;
  readonly deps: CommandDeps<Tx>;
  readonly reads: TrackerTransferReads;
  readonly plan: TransferPlan;
  readonly options: Pick<PlanOptions, 'withOpponents'>;
};

/**
 * The deps with the transaction's clock showing `at` (never later than the real time):
 * the reopen the tracker made is made here at the time it made it, as the dry run
 * plays it (simulateReplay). Only the engine's time moves; nothing else reads it.
 */
function clockAt<Tx extends TrackerTransferTx>(deps: CommandDeps<Tx>, at: number): CommandDeps<Tx> {
  return {
    ...deps,
    transaction: (context, work) =>
      deps.transaction(context, (tx) => {
        const now = tx.clock.now();
        return work({ ...tx, clock: { now: () => Math.min(now, at) } });
      }),
  };
}

/** Why a game here does not end as the tracker's did: final, with its score. */
export function resultProblem(
  here: Pick<PlatformGameFact, 'status' | 'homeScore' | 'awayScore'>,
  tracker: Pick<TrackerGame, 'homeScore' | 'awayScore'>,
): Extract<TransferStop, { kind: 'result-differs' }> | null {
  if (
    here.status === 'final' &&
    here.homeScore === tracker.homeScore &&
    here.awayScore === tracker.awayScore
  ) {
    return null;
  }
  return {
    kind: 'result-differs',
    status: here.status,
    here: { home: here.homeScore, away: here.awayScore },
    tracker: { home: tracker.homeScore, away: tracker.awayScore },
  };
}

/** Sends one game's actions; how many were sent, or why it stopped. */
async function sendGame<Tx extends TrackerTransferTx>(
  args: Args<Tx>,
  gameId: string,
  replay: Replay,
  personOf: (playerId: string) => string,
): Promise<{ readonly sent: number } | TransferStop> {
  const { context, deps, reads } = args;
  const counted = { sent: 0 };
  for (const [index, segment] of replay.segments.entries()) {
    const fact = await reads.game(
      gameId,
      segment.map((step) => step.commandId),
    );
    if (fact === undefined) return { kind: 'not-sent', code: 'game-not-found' };
    const untaken = segment.filter((step) => !fact.taken.has(step.commandId));
    if (untaken.length === 0) continue;
    // The tracker reopened the game here; the platform reopens it with a reason, at the
    // time the tracker did, so the actions after it keep their own times.
    if (isDecided(fact.status)) {
      const at = replay.reopenedAt[index - 1];
      const reopened = await reopenGame(
        context,
        { gameId, version: fact.version, reason: transferReopenReason },
        at === undefined ? deps : clockAt(deps, at),
      );
      if (!reopened.ok) return { kind: 'reopen-refused', code: reopened.error.code };
    }
    // The session is let go however the part ends, stopped early or thrown out of, so
    // the game is free at once rather than when the lease runs out.
    const held: { sessionId?: string } = {};
    let stop: TransferStop | undefined;
    try {
      stop = await sendPart(args, gameId, untaken, personOf, held, counted);
    } finally {
      if (held.sessionId !== undefined) {
        const released = await releaseScoringSession(
          context,
          { gameId, sessionId: held.sessionId },
          deps,
        );
        // A stop already found is the one to report; the session lapses by itself.
        if (!released.ok) stop ??= { kind: 'not-released', code: released.error.code };
      }
    }
    if (stop !== undefined) return stop;
  }
  return { sent: counted.sent };
}

/** Sends one part's actions, a batch at a time; why it stopped, if it did. */
async function sendPart<Tx extends TrackerTransferTx>(
  args: Args<Tx>,
  gameId: string,
  untaken: readonly ReplayStep[],
  personOf: (playerId: string) => string,
  held: { sessionId?: string },
  counted: { sent: number },
): Promise<TransferStop | undefined> {
  const { context, deps } = args;
  for (let from = 0; from < untaken.length; from += maxCommandsPerBatch) {
    // Opened before every batch: it carries on with this device's session and keeps it held.
    const opened = await openScoringSession(context, { gameId, deviceId: transferDeviceId }, deps);
    if (!opened.ok) return { kind: 'not-opened', code: opened.error.code };
    if (opened.value.status !== 'held-by-you') {
      return { kind: 'not-opened', code: opened.value.status };
    }
    const sessionId = opened.value.sessionId;
    held.sessionId = sessionId;
    const batch: readonly ReplayStep[] = untaken.slice(from, from + maxCommandsPerBatch);
    const result = await applyTrackerCommands(
      context,
      {
        gameId,
        protocolVersion: trackerProtocolVersion,
        sessionId,
        commands: batch.map((step) => ({
          commandId: step.commandId,
          at: step.at,
          input: withPeople(step.input, personOf),
        })),
      },
      deps,
    );
    if (!result.ok) return { kind: 'not-sent', code: result.error.code };
    // The door takes the rest of a batch after one it refused; the plan reads the roster
    // and plays the engine as the door does, so none is refused, and the run stops here
    // if one ever is.
    for (const [index, answer] of result.value.results.entries()) {
      if (answer.status === 'refused') {
        return {
          kind: 'action-refused',
          seq: batch[index]?.seq ?? 0,
          message: answer.reason.message,
        };
      }
      if (answer.status === 'accepted') counted.sent += 1;
    }
  }
  return undefined;
}

/** The game's lines here compared with the tracker's. */
async function compareGame(
  reads: TrackerTransferReads,
  plan: TransferPlan,
  gameId: string,
  game: TrackerGame,
  playerOf: ReadonlyMap<string, string>,
): Promise<readonly LineDifference[]> {
  const here = new Map<string, ComparableLine>();
  const others: ComparableLine[] = [];
  for (const line of await reads.lines(gameId)) {
    const playerId = playerOf.get(lower(line.personId));
    if (playerId === undefined) others.push(line);
    else here.set(playerId, line);
  }
  const teamOf = (trackerTeamId: string) => {
    const team = plan.teams.get(trackerTeamId);
    return team?.kind === 'matched' ? team.teamId : undefined;
  };
  return compareLines(game.lines, here, others, teamOf);
}

/** Carries out the plan; what was done, and where it stopped if it did. */
export async function runTrackerTransfer<Tx extends TrackerTransferTx>(
  args: Args<Tx>,
): Promise<TransferReport> {
  const { context, deps, reads, plan, options } = args;
  const added: string[] = [];
  const transferred: { trackerGameId: string; sent: number }[] = [];
  const checked: string[] = [];
  const report = (stopped: TransferReport['stopped']): TransferReport => ({
    added,
    transferred,
    checked,
    notBroughtOver: plan.notBroughtOver,
    stopped,
  });
  if (!plan.ready) return report({ trackerGameId: null, stop: { kind: 'not-ready' } });

  const personOfPlayer = new Map<string, string>();
  for (const [playerId, person] of plan.people) {
    if (person.match.kind === 'on-roster')
      personOfPlayer.set(playerId, lower(person.match.personId));
  }
  for (const [playerId, person] of plan.people) {
    if (!isToAdd(person, options) || person.match.kind !== 'add') continue;
    // Someone an earlier run made a person and was cut off before putting on the team is
    // found again by the plan and only put on the roster now: a rerun never adds twice.
    let personId = person.match.personId;
    if (personId === null) {
      const made = await createPerson(
        context,
        { firstName: person.match.firstName, lastName: person.match.lastName },
        deps,
      );
      if (!made.ok) {
        const stop: TransferStop = { kind: 'person-not-added', playerId, code: made.error.code };
        return report({ trackerGameId: null, stop });
      }
      personId = made.value.personId;
    }
    const jersey = person.match.jerseyNumber;
    const placed = await addToRoster(
      context,
      { teamId: person.teamId, personId, ...(jersey === null ? {} : { jerseyNumber: jersey }) },
      deps,
    );
    if (!placed.ok) {
      const stop: TransferStop = { kind: 'person-not-added', playerId, code: placed.error.code };
      return report({ trackerGameId: null, stop });
    }
    personOfPlayer.set(playerId, lower(personId));
    added.push(playerId);
  }
  const playerOfPerson = new Map([...personOfPlayer].map(([player, person]) => [person, player]));
  // Every player a game to transfer names is here by now: the plan made sure of it.
  const personOf = (playerId: string) => personOfPlayer.get(playerId) ?? playerId;

  for (const planned of plan.games) {
    const { outcome, game } = planned;
    if (outcome.kind !== 'transfer' && outcome.kind !== 'already') continue;
    if (outcome.kind === 'transfer') {
      const sent = await sendGame(args, outcome.gameId, outcome.replay, personOf);
      if ('kind' in sent) return report({ trackerGameId: game.id, stop: sent });
      transferred.push({ trackerGameId: game.id, sent: sent.sent });
    }
    // The game here is final with the tracker's score, and then every line is the same.
    const fact = await reads.game(outcome.gameId, []);
    if (fact === undefined) {
      return report({ trackerGameId: game.id, stop: { kind: 'not-sent', code: 'game-not-found' } });
    }
    const result = resultProblem(fact, game);
    if (result !== null) return report({ trackerGameId: game.id, stop: result });
    const differences = await compareGame(reads, plan, outcome.gameId, game, playerOfPerson);
    if (differences.length > 0) {
      return report({ trackerGameId: game.id, stop: { kind: 'lines-differ', differences } });
    }
    if (outcome.kind === 'already') checked.push(game.id);
  }
  return report(null);
}
