// Carries out a transfer plan (plan-tracker-transfer.ts, step 2.58), only through the
// product's own commands, each its own transaction: people are added with
// people.create_person and put on their team's roster with their numbers
// (teams.add_to_roster); each game is opened to score on one device
// (games.open_scoring_session), its actions are sent a few at a time through the
// tracker's door (games.apply_tracker_commands), which ends the game when it meets the
// tracker's own End game, settles its lines and works out the standings (T6 §7); a game
// the tracker reopened is reopened between its parts with games.reopen_game. The
// tracker's own action ids are kept, so a run that stopped part-way picks up where it
// was, and a second run is told every action is a duplicate and changes nothing (T-137).
//
// After each game its box score lines here are compared with the tracker's, and the run
// stops at the first difference, at any action the door refuses, or at any command that
// says no, with what it was. A game transferred before is only compared again.
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
import type { TrackerGame, TrackerTransferReads } from './tracker-transfer-data.ts';
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
  | { readonly kind: 'lines-differ'; readonly differences: readonly LineDifference[] };

export type TransferReport = {
  /** People added, by tracker player id. */
  readonly added: readonly string[];
  /** Tracker games transferred now, with how many actions were sent for each. */
  readonly transferred: readonly { readonly trackerGameId: string; readonly sent: number }[];
  /** Tracker games already here, whose lines were compared again. */
  readonly checked: readonly string[];
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

/** Sends one game's actions; how many were sent, or why it stopped. */
async function sendGame<Tx extends TrackerTransferTx>(
  args: Args<Tx>,
  gameId: string,
  replay: Replay,
  personOf: (playerId: string) => string,
): Promise<{ readonly sent: number } | TransferStop> {
  const { context, deps, reads } = args;
  let sent = 0;
  for (const segment of replay.segments) {
    const fact = await reads.game(
      gameId,
      segment.map((step) => step.commandId),
    );
    if (fact === undefined) return { kind: 'not-sent', code: 'game-not-found' };
    const untaken = segment.filter((step) => !fact.taken.has(step.commandId));
    if (untaken.length === 0) continue;
    // The tracker reopened the game here; the platform reopens it with a reason.
    if (isDecided(fact.status)) {
      const reopened = await reopenGame(
        context,
        { gameId, version: fact.version, reason: transferReopenReason },
        deps,
      );
      if (!reopened.ok) return { kind: 'reopen-refused', code: reopened.error.code };
    }
    let sessionId: string | undefined;
    for (let from = 0; from < untaken.length; from += maxCommandsPerBatch) {
      // Opened before every batch: it carries on with this device's session and keeps it held.
      const opened = await openScoringSession(
        context,
        { gameId, deviceId: transferDeviceId },
        deps,
      );
      if (!opened.ok) return { kind: 'not-opened', code: opened.error.code };
      if (opened.value.status !== 'held-by-you') {
        return { kind: 'not-opened', code: opened.value.status };
      }
      sessionId = opened.value.sessionId;
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
      for (const [index, answer] of result.value.results.entries()) {
        if (answer.status === 'refused') {
          return {
            kind: 'action-refused',
            seq: batch[index]?.seq ?? 0,
            message: answer.reason.message,
          };
        }
        if (answer.status === 'accepted') sent += 1;
      }
    }
    if (sessionId !== undefined) {
      await releaseScoringSession(context, { gameId, sessionId }, deps);
    }
  }
  return { sent };
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
    const made = await createPerson(
      context,
      { firstName: person.match.firstName, lastName: person.match.lastName },
      deps,
    );
    if (!made.ok) {
      const stop: TransferStop = { kind: 'person-not-added', playerId, code: made.error.code };
      return report({ trackerGameId: null, stop });
    }
    const jersey = person.match.jerseyNumber;
    const placed = await addToRoster(
      context,
      {
        teamId: person.teamId,
        personId: made.value.personId,
        ...(jersey === null ? {} : { jerseyNumber: jersey }),
      },
      deps,
    );
    if (!placed.ok) {
      const stop: TransferStop = { kind: 'person-not-added', playerId, code: placed.error.code };
      return report({ trackerGameId: null, stop });
    }
    personOfPlayer.set(playerId, lower(made.value.personId));
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
    const differences = await compareGame(reads, plan, outcome.gameId, game, playerOfPerson);
    if (differences.length > 0) {
      return report({ trackerGameId: game.id, stop: { kind: 'lines-differ', differences } });
    }
    if (outcome.kind === 'already') checked.push(game.id);
  }
  return report(null);
}
