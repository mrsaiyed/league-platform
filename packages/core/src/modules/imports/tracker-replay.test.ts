import { randomUUID } from 'node:crypto';
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { playersNamed, readReplay, simulateReplay, withPeople } from './tracker-replay.ts';
import type { TrackerGame } from './tracker-transfer-data.ts';

type Input = Parameters<typeof basketball.apply>[1];
const home = [randomUUID(), randomUUID()];
const away = [randomUUID()];
const start = Date.UTC(2026, 0, 5, 0, 30);

/** A made-up game as the tracker stores it, its actions 20 seconds apart. */
function stored(inputs: readonly Input[], over: Partial<TrackerGame> = {}): TrackerGame {
  let state = basketball.newGame(basketball.QUARTERS, start - 1000);
  const events = inputs.map((input, k) => {
    const at = start + k * 20_000;
    const commandId = randomUUID();
    state = basketball.apply(state, input, { id: commandId, now: at });
    return {
      seq: k + 1,
      commandId,
      command: { at, input },
      acceptedAt: new Date(at + 100).toISOString(),
    };
  });
  return {
    id: randomUUID(),
    homeTeamId: 'h',
    awayTeamId: 'a',
    startsAt: null,
    sourceRef: null,
    status: state.status,
    homeScore: 0,
    awayScore: 0,
    state,
    events,
    lines: [],
    ...over,
  };
}

const played: Input[] = [
  { type: 'lineup', side: 'home', playerIds: [home[0]!] },
  { type: 'lineup', side: 'away', playerIds: [away[0]!] },
  { type: 'start' },
  { type: 'score', side: 'home', playerId: home[0]!, points: 2 },
  { type: 'pause' },
  { type: 'end' },
];

describe('reading a tracker game’s actions for the replay', () => {
  it('keeps only what follows the last reset, leaves out format settings, and cuts at reopens', () => {
    const game = stored([
      { type: 'rules', rules: basketball.QUARTERS },
      { type: 'lineup', side: 'home', playerIds: [home[1]!] },
      { type: 'reset' },
      { type: 'rules', rules: basketball.QUARTERS },
      ...played,
      { type: 'colors', swapped: true },
      { type: 'reopen' },
      { type: 'score', side: 'home', playerId: home[0]!, points: 1 },
      { type: 'end' },
    ]);
    const read = readReplay(game);
    if (!read.ok) throw new Error('not read');
    expect(read.replay.leftOut).toEqual({ beforeReset: 3, rules: 1, colorsWhileEnded: 1 });
    expect(read.replay.segments.map((part) => part.map((step) => step.input.type))).toEqual([
      ['lineup', 'lineup', 'start', 'score', 'pause', 'end'],
      ['score', 'end'],
    ]);
    expect(read.replay.format).toEqual({ periods: 4, periodSeconds: 480, overtimeSeconds: 240 });
    expect(playersNamed(read.replay)).toEqual(new Set([home[0], away[0]]));
  });

  it('takes the earlier of the tap and the server’s time, and an older bare action', () => {
    const game = stored(played.slice(0, 1));
    const [event] = game.events;
    const late = { ...event!, command: { at: start + 999_999, input: played[0] } };
    const bare = { ...event!, command: played[0] };
    const read = readReplay({ ...game, events: [late] });
    const old = readReplay({ ...game, events: [bare] });
    if (!read.ok || !old.ok) throw new Error('not read');
    expect(read.replay.segments[0]?.[0]?.at).toBe(start + 100);
    expect(old.replay.segments[0]?.[0]?.at).toBe(start + 100);
  });

  it('refuses an action or a state it cannot read', () => {
    const game = stored(played);
    const bad = { ...game.events[0]!, command: { at: 1, input: { type: 'dunk' } } };
    expect(readReplay({ ...game, events: [bad] })).toEqual({
      ok: false,
      problem: { kind: 'unreadable-action', seq: 1 },
    });
    expect(readReplay({ ...game, state: { version: 2 } })).toEqual({
      ok: false,
      problem: { kind: 'unreadable-state' },
    });
  });
});

describe('playing the replay through the engine', () => {
  it('gives the tracker’s lines and score, reopening between parts', () => {
    const inputs: Input[] = [
      ...played,
      { type: 'reopen' },
      { type: 'score', side: 'away', playerId: away[0]!, points: 3 },
      { type: 'end' },
    ];
    const game = stored(inputs);
    const read = readReplay(game);
    if (!read.ok) throw new Error('not read');
    const simulation = simulateReplay(read.replay, basketball.QUARTERS, false, start + 3_600_000);
    if (!simulation.ok) throw new Error('refused');
    const tracker = basketball.derive(game.state as basketball.GameState);
    expect(simulation.status).toBe('final');
    expect(simulation.score).toEqual({ home: 2, away: 3 });
    expect(simulation.lines.get(home[0]!.toLowerCase())).toMatchObject({
      points: 2,
      ms: tracker.players[home[0]!]!.ms,
    });
  });

  it('refuses a level end when ties are not allowed, and says which action the engine refused', () => {
    const level: Input[] = [
      ...played.slice(0, 4),
      { type: 'score', side: 'away', playerId: away[0]!, points: 2 },
      { type: 'end' },
    ];
    const read = readReplay(stored(level));
    if (!read.ok) throw new Error('not read');
    expect(simulateReplay(read.replay, basketball.QUARTERS, false, Date.now())).toEqual({
      ok: false,
      problem: { kind: 'tie-not-allowed' },
    });
    expect(simulateReplay(read.replay, basketball.QUARTERS, true, Date.now()).ok).toBe(true);
    // Played in a format with no time on the clock left, the start is refused.
    const refused = simulateReplay(
      read.replay,
      { ...basketball.QUARTERS, periodSeconds: 0 },
      true,
      Date.now(),
    );
    expect(refused).toMatchObject({ ok: false, problem: { kind: 'refused', seq: 3 } });
  });

  it('puts the platform’s person ids in place of the tracker’s player ids', () => {
    const input: Input = { type: 'sub', side: 'home', inId: 'A', outId: 'b' };
    const ids = new Map([
      ['a', 'person-a'],
      ['b', 'person-b'],
    ]);
    expect(withPeople(input, (id) => ids.get(id) ?? id)).toEqual({
      type: 'sub',
      side: 'home',
      inId: 'person-a',
      outId: 'person-b',
    });
  });
});
