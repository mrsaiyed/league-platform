// The actions of one tracker game, made ready to be played again through the platform's
// door for the tracker (games.apply_tracker_commands, step 2.29), and played through the
// engine here first, the way that door plays them, so a dry run can say whether every
// box score line will come out the same (step 2.58).
//
// What the door does not take is dealt with here, and counted so the plan can say so:
// - a "rules" action: the platform's game takes its rules from the league (S-1), so it
//   is left out; the plan checks the formats agree instead;
// - "reset" ("mark not started") wipes everything before it, so only the actions after
//   the last one are played again;
// - "reopen" is not a tap on the platform (it needs a reason, T6 §8), so the actions
//   are cut into parts at each reopen, and the runner reopens the game between them
//   with games.reopen_game, which applies the engine's own reopen;
// - swapping colors on an ended game changes nothing that is kept, and the door turns
//   away anything sent to an ended game, so those are left out.
// Every stored action is checked against the tracker's own command shape before any of
// this: a backup is data from elsewhere, never trusted as it is.
import { TrackerCommand } from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { z } from 'zod';
import type { TrackerGame } from './tracker-transfer-data.ts';

/** An action as the door takes it: the tracker's command, its id and when it was tapped. */
export type TrackerInput = TrackerCommand['input'];

/** The actions played again: every one but the tracker's format setting. */
export type ReplayInput = Exclude<TrackerInput, { readonly type: 'rules' }>;

type StoredStep = {
  /** The tracker's own id for it, in lower case, so a second run is told it is a duplicate. */
  readonly commandId: string;
  readonly seq: number;
  /** When it was tapped, as the tracker counted it (never after its server took it). */
  readonly at: number;
  readonly input: TrackerInput;
};

export type ReplayStep = StoredStep & { readonly input: ReplayInput };

export type Replay = {
  /** The actions in order, cut at each reopen. */
  readonly segments: readonly (readonly ReplayStep[])[];
  readonly leftOut: {
    readonly beforeReset: number;
    readonly rules: number;
    readonly colorsWhileEnded: number;
  };
  /** The format the tracker played the game in, as its last state has it. */
  readonly format: {
    readonly periods: number;
    readonly periodSeconds: number;
    readonly overtimeSeconds: number;
  };
};

export type ReplayProblem =
  | { readonly kind: 'unreadable-action'; readonly seq: number }
  | { readonly kind: 'unreadable-state' };

const Input = TrackerCommand.shape.input;
const Stored = z.union([
  z.strictObject({ at: z.number().int().nonnegative().nullable().optional(), input: Input }),
  Input,
]);
const StoredState = z.looseObject({
  version: z.literal(1),
  rules: z.looseObject({
    periods: z.number().int().positive(),
    periodSeconds: z.number().int().positive(),
    overtimeSeconds: z.number().int().nonnegative(),
  }),
});
const Uuid = z.uuid();

/** A tracker game's stored actions, checked and made ready to send. */
export function readReplay(
  game: TrackerGame,
):
  | { readonly ok: true; readonly replay: Replay }
  | { readonly ok: false; readonly problem: ReplayProblem } {
  const state = StoredState.safeParse(game.state);
  if (!state.success) return { ok: false, problem: { kind: 'unreadable-state' } };
  const steps: StoredStep[] = [];
  for (const event of [...game.events].sort((a, b) => a.seq - b.seq)) {
    const stored = Stored.safeParse(event.command);
    const accepted = Date.parse(event.acceptedAt);
    if (!stored.success || Number.isNaN(accepted) || !Uuid.safeParse(event.commandId).success) {
      return { ok: false, problem: { kind: 'unreadable-action', seq: event.seq } };
    }
    const value = stored.data;
    const input = 'input' in value ? value.input : value;
    const tapped = 'input' in value ? (value.at ?? accepted) : accepted;
    steps.push({
      commandId: event.commandId.toLowerCase(),
      seq: event.seq,
      at: Math.min(accepted, tapped),
      input,
    });
  }
  const lastReset = steps.findLastIndex((step) => step.input.type === 'reset');
  const kept = steps.slice(lastReset + 1);
  const segments: ReplayStep[][] = [[]];
  let ended = false;
  let rules = 0;
  let colorsWhileEnded = 0;
  for (const stored of kept) {
    const input = stored.input;
    if (input.type === 'rules') {
      rules += 1;
      continue;
    }
    const step: ReplayStep = { ...stored, input };
    switch (input.type) {
      case 'reopen':
        ended = false;
        segments.push([]);
        continue;
      case 'colors':
        if (ended) {
          colorsWhileEnded += 1;
          continue;
        }
        break;
      case 'end':
        ended = true;
        break;
      default:
        break;
    }
    segments.at(-1)?.push(step);
  }
  const { periods, periodSeconds, overtimeSeconds } = state.data.rules;
  return {
    ok: true,
    replay: {
      segments,
      leftOut: { beforeReset: lastReset + 1, rules, colorsWhileEnded },
      format: { periods, periodSeconds, overtimeSeconds },
    },
  };
}

/** Every action of the replay, in order. */
export const replaySteps = (replay: Replay): readonly ReplayStep[] => replay.segments.flat();

/** The ids of the players an action names. */
function playersOf(input: ReplayInput): readonly string[] {
  switch (input.type) {
    case 'lineup':
      return input.playerIds;
    case 'sub':
      return [input.inId, input.outId];
    case 'score':
    case 'foul':
    case 'unfoul':
    case 'turnover':
    case 'unturnover':
      return [input.playerId];
    default:
      return [];
  }
}

/** Every tracker player the replay names, in lower case. */
export function playersNamed(replay: Replay): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const step of replaySteps(replay)) {
    for (const id of playersOf(step.input)) ids.add(id.toLowerCase());
  }
  return ids;
}

/** The action with each tracker player id put as the platform's person id. */
export function withPeople(
  input: ReplayInput,
  personOf: (playerId: string) => string,
): ReplayInput {
  const to = (id: string) => personOf(id.toLowerCase());
  switch (input.type) {
    case 'lineup':
      return { ...input, playerIds: input.playerIds.map(to) };
    case 'sub':
      return { ...input, inId: to(input.inId), outId: to(input.outId) };
    case 'score':
    case 'foul':
    case 'unfoul':
    case 'turnover':
    case 'unturnover':
      return { ...input, playerId: to(input.playerId) };
    default:
      return input;
  }
}

export type SimulatedLine = {
  readonly side: basketball.Side;
  readonly appeared: boolean;
  readonly ms: number;
  readonly points: number;
  readonly fg1: number;
  readonly fg2: number;
  readonly fg3: number;
  readonly fouls: number;
  readonly turnovers: number;
};

export type Simulation =
  | {
      readonly ok: true;
      readonly status: basketball.GameState['status'];
      readonly score: { readonly home: number; readonly away: number };
      /** By tracker player id, in lower case. */
      readonly lines: ReadonlyMap<string, SimulatedLine>;
    }
  | {
      readonly ok: false;
      readonly problem:
        | { readonly kind: 'refused'; readonly seq: number; readonly message: string }
        | { readonly kind: 'tie-not-allowed' };
    };

/**
 * The replay played through the engine as the door plays it: a new game in the
 * platform's rules made at time 0, each action at its tap time (never later than
 * `now`), a level score refused at the end unless ties are allowed, and between parts
 * the engine's reopen at `now`, as games.reopen_game makes it.
 */
export function simulateReplay(
  replay: Replay,
  rules: basketball.Rules,
  allowTies: boolean,
  now: number,
): Simulation {
  let state = basketball.newGame(rules, 0);
  for (const [index, segment] of replay.segments.entries()) {
    if (index > 0 && state.status === 'final') {
      state = basketball.apply(state, { type: 'reopen' }, { id: 'reopen', now });
    }
    for (const step of segment) {
      let next: basketball.GameState;
      try {
        next = basketball.apply(state, step.input, {
          id: step.commandId,
          now: Math.min(now, step.at),
        });
      } catch (thrown) {
        if (thrown instanceof basketball.TrackerError) {
          return {
            ok: false,
            problem: { kind: 'refused', seq: step.seq, message: thrown.message },
          };
        }
        throw thrown;
      }
      if (step.input.type === 'end' && !allowTies) {
        const teams = basketball.derive(next).teams;
        if (teams.home.score === teams.away.score) {
          return { ok: false, problem: { kind: 'tie-not-allowed' } };
        }
      }
      state = next;
    }
  }
  const derived = basketball.derive(state);
  const lines = new Map<string, SimulatedLine>();
  for (const [playerId, line] of Object.entries(derived.players)) {
    lines.set(playerId.toLowerCase(), {
      side: line.side,
      appeared: line.appeared,
      ms: line.ms,
      points: line.points,
      fg1: line.fg1,
      fg2: line.fg2,
      fg3: line.fg3,
      fouls: line.fouls,
      turnovers: line.turnovers,
    });
  }
  return {
    ok: true,
    status: state.status,
    score: { home: derived.teams.home.score, away: derived.teams.away.score },
    lines,
  };
}
