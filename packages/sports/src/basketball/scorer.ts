import type { Command, Player, Rules, Side } from '../../../contracts/src/varsity.ts';

export type Line = Player & {
  points: number;
  ones: number;
  twos: number;
  threes: number;
  fouls: number;
  milliseconds: number;
  appeared: boolean;
};
export type RecordedEvent = {
  id: string;
  at: number;
  input: Command;
  period: number;
  remainingMs: number;
  reversed: boolean;
};
export type GameState = {
  version: 1;
  status: 'ready' | 'live' | 'final';
  period: number;
  remainingMs: number;
  running: boolean;
  anchorMs: number;
  rules: Rules;
  trackedSide: Side;
  minutesQuality: 'tracked' | 'review-required';
  players: Record<string, Line>;
  lineups: Record<Side, string[]>;
  events: RecordedEvent[];
};
export class ScoringError extends Error {}
function requireRule(valid: unknown, message: string): asserts valid {
  if (!valid) throw new ScoringError(message);
}

export function initialGame(
  players: Player[],
  rules: Rules,
  trackedSide: Side,
  now: number,
): GameState {
  requireRule(
    new Set(players.map((p) => p.id)).size === players.length,
    'Duplicate player identity.',
  );
  for (const side of ['home', 'away'] as const) {
    const team = players.filter((p) => p.side === side);
    requireRule(team.length > 0 && team.length <= 30, 'Each side needs 1–30 players.');
    requireRule(
      new Set(team.map((p) => p.jersey)).size === team.length,
      'Jersey numbers must be unique within a team.',
    );
  }
  return {
    version: 1,
    status: 'ready',
    period: 1,
    remainingMs: rules.periodSeconds * 1000,
    running: false,
    anchorMs: now,
    rules,
    trackedSide,
    minutesQuality: 'tracked',
    players: Object.fromEntries(
      players.map((p) => [
        p.id,
        {
          ...p,
          points: 0,
          ones: 0,
          twos: 0,
          threes: 0,
          fouls: 0,
          milliseconds: 0,
          appeared: false,
        },
      ]),
    ),
    lineups: { home: [], away: [] },
    events: [],
  };
}

/** Server time advances the accepted clock; tab visibility never changes game time. */
export function currentGame(saved: GameState, now: number): GameState {
  const state = structuredClone(saved);
  if (state.running) {
    const elapsed = Math.min(state.remainingMs, Math.max(0, Math.floor(now - state.anchorMs)));
    state.remainingMs -= elapsed;
    for (const side of ['home', 'away'] as const)
      for (const id of state.lineups[side]) {
        const line = state.players[id];
        if (line) line.milliseconds += elapsed;
      }
    if (state.remainingMs === 0) state.running = false;
  }
  state.anchorMs = Math.max(now, state.anchorMs);
  return state;
}

export function reduceCommand(
  saved: GameState,
  input: Command,
  id: string,
  now: number,
): GameState {
  const state = currentGame(saved, now);
  requireRule(
    state.events.length < 10000,
    'This preview reached its 10,000-command limit. Export the game before continuing elsewhere.',
  );
  if (state.status === 'final')
    requireRule(input.type === 'reopen', 'Reopen the result with a reason before correcting it.');
  const getPlayer = (pid: string): Line => {
    const player = state.players[pid];
    if (!player) throw new ScoringError('Player is not in this game roster.');
    return player;
  };
  switch (input.type) {
    case 'lineup': {
      requireRule(
        !state.running,
        'Pause the clock before replacing a lineup. Use substitution while playing.',
      );
      requireRule(
        new Set(input.playerIds).size === input.playerIds.length,
        'Select each player once.',
      );
      for (const pid of input.playerIds)
        requireRule(getPlayer(pid).side === input.side, 'Player belongs to the other team.');
      state.lineups[input.side] = [...input.playerIds];
      break;
    }
    case 'start':
      requireRule(
        !state.running && state.remainingMs > 0,
        'The clock is running or the period has ended.',
      );
      requireRule(
        state.lineups.home.length > 0 && state.lineups.away.length > 0,
        'Set the on-court players for both teams first.',
      );
      state.status = 'live';
      state.running = true;
      for (const pid of [...state.lineups.home, ...state.lineups.away])
        getPlayer(pid).appeared = true;
      break;
    case 'pause':
      requireRule(state.status === 'live', 'Start the game first.');
      state.running = false;
      break;
    case 'score':
    case 'foul': {
      requireRule(state.status === 'live', 'Start the game before recording a play.');
      const p = getPlayer(input.playerId);
      requireRule(
        state.lineups[p.side].includes(p.id),
        'Substitute this player onto the court first.',
      );
      p.appeared = true;
      if (input.type === 'foul') p.fouls += 1;
      else {
        p.points += input.points;
        p[input.points === 1 ? 'ones' : input.points === 2 ? 'twos' : 'threes'] += 1;
      }
      break;
    }
    case 'substitute': {
      requireRule(state.status === 'live', 'Set starting lineups before beginning the game.');
      const out = getPlayer(input.outId),
        incoming = getPlayer(input.inId);
      requireRule(
        out.side === input.side && incoming.side === input.side,
        'Both players must belong to this side.',
      );
      requireRule(
        state.lineups[input.side].includes(out.id) &&
          !state.lineups[input.side].includes(incoming.id),
        'Choose an on-court player and a bench player.',
      );
      state.lineups[input.side] = state.lineups[input.side].map((pid) =>
        pid === out.id ? incoming.id : pid,
      );
      incoming.appeared = true;
      break;
    }
    case 'undo': {
      const target = state.events.find((e) => e.id === input.targetId);
      requireRule(
        target &&
          !target.reversed &&
          (target.input.type === 'score' || target.input.type === 'foul'),
        'Only an unreversed basket or foul can be taken back here.',
      );
      if (!target || (target.input.type !== 'score' && target.input.type !== 'foul'))
        throw new ScoringError('Invalid correction.');
      const p = getPlayer(target.input.playerId);
      if (target.input.type === 'foul') p.fouls -= 1;
      else {
        p.points -= target.input.points;
        p[target.input.points === 1 ? 'ones' : target.input.points === 2 ? 'twos' : 'threes'] -= 1;
      }
      target.reversed = true;
      break;
    }
    case 'clock': {
      requireRule(!state.running, 'Pause before correcting the clock.');
      const limit =
        state.period <= state.rules.periods
          ? state.rules.periodSeconds
          : state.rules.overtimeSeconds;
      requireRule(input.seconds <= limit, 'Clock exceeds the configured period length.');
      if (state.status === 'live' && input.seconds * 1000 !== state.remainingMs)
        state.minutesQuality = 'review-required';
      state.remainingMs = input.seconds * 1000;
      break;
    }
    case 'next-period':
      requireRule(
        state.status === 'live' && !state.running && state.remainingMs === 0,
        'Finish the current period before advancing.',
      );
      state.period += 1;
      state.remainingMs =
        1000 *
        (state.period <= state.rules.periods
          ? state.rules.periodSeconds
          : state.rules.overtimeSeconds);
      break;
    case 'finalize':
      requireRule(
        state.status === 'live' && !state.running,
        'Pause an active game before finalizing.',
      );
      state.status = 'final';
      break;
    case 'reopen':
      requireRule(state.status === 'final', 'Only a final result can be reopened.');
      state.status = 'live';
      state.running = false;
      break;
  }
  state.events.push({
    id,
    at: now,
    input,
    period: state.period,
    remainingMs: state.remainingMs,
    reversed: false,
  });
  return state;
}

export function teamTotals(state: GameState, side: Side) {
  const players = Object.values(state.players).filter((p) => p.side === side);
  return {
    score: players.reduce((n, p) => n + p.points, 0),
    fouls: players.reduce((n, p) => n + p.fouls, 0),
    periodFouls: state.events.filter(
      (e) =>
        e.period === state.period &&
        !e.reversed &&
        e.input.type === 'foul' &&
        state.players[e.input.playerId]?.side === side,
    ).length,
  };
}
