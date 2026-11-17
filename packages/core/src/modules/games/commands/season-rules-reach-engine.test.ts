// Step 2.122: the season's foul limit, mercy lead and last-minutes stop clock reach the
// engine through the tracker's door (games.apply_tracker_commands), and the state the
// device loads (games.read_tracker_state) carries them, so device and server judge
// every tap by the same rules. A game keeps the rules it started with (S-1). The
// door takes the platform's command shape, the clock-mode switch included (T-128,
// record 062), and still takes every batch the present tracker sends (T-127).
import { seasonRulesPreset, type SeasonRules, type TrackerCommand } from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import {
  awayTeamId,
  game,
  gameUuid,
  homeTeamId,
  schedulerGrant,
  schedulerId,
  scorekeeperGrant,
  scorekeeperId,
  seasonId,
} from '../memory-games.test-helper.ts';
import { sessionUuid, startOfTest } from '../memory-scoring.test-helper.ts';
import { memoryTracker, type MemoryTracker } from '../memory-tracker.test-helper.ts';
import type { GamePlayer } from '../ports.ts';
import { leaseMs } from '../scoring-session.ts';
import { applyTrackerCommands } from './apply-tracker-commands.ts';
import { markNotStarted } from './mark-not-started.ts';
import { openScoringSession } from './open-scoring-session.ts';
import { readTrackerState } from './read-tracker-state.ts';

const gameId = gameUuid(1);
const sessionId = sessionUuid(1);
const homeIds = [1, 2, 3, 4, 5].map(
  (n) => `01900000-0000-7000-8000-00000001${String(n).padStart(4, '0')}`,
);
const awayIds = [1, 2, 3, 4, 5].map(
  (n) => `01900000-0000-7000-8000-00000002${String(n).padStart(4, '0')}`,
);
const [fouler = '', scorer = ''] = homeIds;
const commandUuid = (n: number) => `01900000-0000-7000-8000-0000c1${String(n).padStart(6, '0')}`;

const roster: GamePlayer[] = [
  ...homeIds.map((personId, i) => ({
    personId,
    teamId: homeTeamId,
    jerseyNumber: String(i + 10),
    onGameDay: true,
  })),
  ...awayIds.map((personId, i) => ({
    personId,
    teamId: awayTeamId,
    jerseyNumber: String(i + 20),
    onGameDay: true,
  })),
];

/** The high-school preset (quarters, stop clock), changed as a test needs. */
function seasonRules(change: (r: SeasonRules) => void = () => {}): SeasonRules {
  const r = seasonRulesPreset('high-school');
  change(r);
  return r;
}

const withLimit = (limit: number | null) =>
  seasonRules((r) => {
    r.fouls.playerFoulLimit = limit;
  });

function setUp(rules: SeasonRules, state: Partial<MemoryTracker> = {}) {
  return memoryTracker({
    seasons: [{ id: seasonId, programId: 'p1', rules }],
    games: [game(1, { captureMode: 'live' })],
    grants: [scorekeeperGrant],
    sessions: [
      {
        id: sessionId,
        gameId,
        accountId: scorekeeperId,
        deviceId: 'tablet',
        since: startOfTest,
        heldUntil: startOfTest + leaseMs,
      },
    ],
    players: roster,
    ...state,
  });
}

type Input = TrackerCommand['input'];
let next = 0;
/** Numbered commands, a millisecond apart, never after the server's clock. */
const taps = (inputs: readonly Input[]): TrackerCommand[] =>
  inputs.map((input) => {
    next += 1;
    return { commandId: commandUuid(next), at: startOfTest + next, input };
  });

const tipOff: Input[] = [
  { type: 'lineup', side: 'home', playerIds: homeIds },
  { type: 'lineup', side: 'away', playerIds: awayIds },
];
const foul: Input = { type: 'foul', side: 'home', playerId: fouler };
const fouls = (n: number): Input[] => Array.from({ length: n }, () => foul);

async function send(
  t: ReturnType<typeof setUp>,
  inputs: readonly Input[],
  protocolVersion = 2,
): Promise<string[]> {
  // The server never puts a tap later than its own clock: keep it ahead of the taps.
  t.clock.advance(1);
  const result = await applyTrackerCommands(
    t.as(scorekeeperId),
    { gameId, protocolVersion, sessionId, commands: taps(inputs) },
    t.deps,
  );
  if (!result.ok) throw new Error(`batch turned away: ${result.error.code}`);
  return result.value.results.map((r) => r.status);
}

/** The state the server saved. */
const savedState = (t: ReturnType<typeof setUp>) =>
  t.db.state.states.find((s) => s.gameId === gameId)?.state as basketball.GameState;

/** The state a scorekeeper's device loads, which it applies its taps on. */
async function deviceState(t: ReturnType<typeof setUp>): Promise<basketball.GameState> {
  const read = await readTrackerState(t.as(scorekeeperId), { gameId }, t.deps);
  if (!read.ok) throw new Error('state not read');
  return read.value.state;
}

const lineOf = (state: basketball.GameState, playerId: string) =>
  basketball.derive(state).players[playerId];

describe('the foul limit reaches the engine (step 2.122, S-32)', () => {
  it('a season with a limit of four marks a player out at four, in the saved state and the one a device loads', async () => {
    const t = setUp(withLimit(4));
    expect(await send(t, [...tipOff, ...fouls(3)])).toEqual(Array(5).fill('accepted'));
    expect(lineOf(savedState(t), fouler)).toMatchObject({ fouls: 3 });
    expect(lineOf(savedState(t), fouler)?.fouledOut).toBeUndefined();

    expect(await send(t, [foul])).toEqual(['accepted']);
    expect(lineOf(savedState(t), fouler)).toMatchObject({ fouls: 4, fouledOut: true });
    const loaded = await deviceState(t);
    expect(loaded).toEqual(savedState(t));
    expect(lineOf(loaded, fouler)?.fouledOut).toBe(true);

    // Only marked (S-32): a fifth foul is still taken, and taking one back unmarks them.
    expect(await send(t, [foul, { type: 'unfoul', side: 'home', playerId: fouler }])).toEqual([
      'accepted',
      'accepted',
    ]);
    expect(lineOf(savedState(t), fouler)).toMatchObject({ fouls: 4, fouledOut: true });
    expect(await send(t, [{ type: 'unfoul', side: 'home', playerId: fouler }])).toEqual([
      'accepted',
    ]);
    expect(lineOf(savedState(t), fouler)?.fouledOut).toBeUndefined();
  });

  it('a season with no limit never marks anyone out', async () => {
    const t = setUp(withLimit(null));
    await send(t, [...tipOff, ...fouls(8)]);
    expect(savedState(t).rules.playerFoulLimit).toBeUndefined();
    expect(lineOf(savedState(t), fouler)).toMatchObject({ fouls: 8 });
    expect(lineOf(savedState(t), fouler)?.fouledOut).toBeUndefined();
  });
});

describe('a game keeps the rules it started with (S-1)', () => {
  it('a season changed mid-game leaves the game under way, on the server and on a device that reloads', async () => {
    const t = setUp(withLimit(4));
    await send(t, [...tipOff, ...fouls(2)]);
    const season = t.db.state.seasons[0];
    if (season === undefined) throw new Error('no season');
    season.rules = withLimit(6);

    await send(t, fouls(2));
    expect(savedState(t).rules.playerFoulLimit).toBe(4);
    expect(lineOf(savedState(t), fouler)).toMatchObject({ fouls: 4, fouledOut: true });
    expect(t.db.state.games[0]?.format).toEqual(withLimit(4));
    const reloaded = await deviceState(t);
    expect(reloaded.rules.playerFoulLimit).toBe(4);
    expect(lineOf(reloaded, fouler)?.fouledOut).toBe(true);
  });

  it('a season changed after the game ended leaves it as it was', async () => {
    const t = setUp(withLimit(4));
    await send(t, [
      ...tipOff,
      ...fouls(4),
      { type: 'score', side: 'home', playerId: scorer, points: 2 },
      { type: 'end' },
    ]);
    expect(savedState(t).status).toBe('final');
    const season = t.db.state.seasons[0];
    if (season !== undefined) season.rules = withLimit(null);
    const loaded = await deviceState(t);
    expect(loaded.rules.playerFoulLimit).toBe(4);
    expect(lineOf(loaded, fouler)?.fouledOut).toBe(true);
  });

  it('line-ups alone do not fix them: a limit changed before tip-off still reaches the game', async () => {
    const t = setUp(withLimit(4));
    await send(t, tipOff);
    const season = t.db.state.seasons[0];
    if (season !== undefined) season.rules = withLimit(3);
    expect((await deviceState(t)).rules.playerFoulLimit).toBe(3);
    await send(t, fouls(3));
    expect(savedState(t).rules.playerFoulLimit).toBe(3);
    expect(lineOf(savedState(t), fouler)?.fouledOut).toBe(true);
  });

  it('a game saved before the limit reached the engine keeps playing without one', async () => {
    // A state started before step 2.122: its rules have no limit, though its format does.
    const before = basketball.newGame({ ...basketball.QUARTERS, clockMode: 'stop' }, 0);
    let state = before;
    const earlier: basketball.Command[] = [
      { type: 'lineup', side: 'home', playerIds: homeIds },
      { type: 'lineup', side: 'away', playerIds: awayIds },
      { type: 'start' },
    ];
    for (const [i, input] of earlier.entries()) {
      state = basketball.apply(state, input, { id: commandUuid(900 + i), now: startOfTest });
    }
    const t = setUp(withLimit(4), {
      games: [game(1, { captureMode: 'live', status: 'live', format: withLimit(5) })],
      states: [{ gameId, seq: earlier.length, state }],
      events: earlier.map(({ type, ...payload }, i) => ({
        gameId,
        seq: i + 1,
        commandId: commandUuid(900 + i),
        type,
        payload,
        tappedAt: startOfTest,
        accountId: scorekeeperId,
      })),
    });
    await send(t, fouls(6));
    expect(savedState(t).rules.playerFoulLimit).toBeUndefined();
    expect(lineOf(savedState(t), fouler)?.fouledOut).toBeUndefined();
  });
});

describe('the mercy lead reaches the engine (step 2.122, S-31)', () => {
  it('the basket that brings the lead to the season’s mercy lead switches to a running clock', async () => {
    const t = setUp(
      seasonRules((r) => {
        r.clock = { mode: 'stop', stopClockLastSeconds: null, mercyLead: 6 };
      }),
    );
    const three: Input = { type: 'score', side: 'home', playerId: scorer, points: 3 };
    await send(t, [...tipOff, { type: 'start' }, three]);
    expect(basketball.derive(savedState(t)).clockMode).toBe('stop');
    await send(t, [three]);
    const state = savedState(t);
    expect(state.plays.at(-1)).toMatchObject({ type: 'score', mercyClock: true });
    expect(basketball.derive(state).clockMode).toBe('running');
    // Under the running clock a foul no longer stops it.
    await send(t, [foul]);
    expect(savedState(t).clock.running).toBe(true);
    expect(savedState(t).plays.at(-1)?.stoppedClock).toBeUndefined();
    // The scorer switches back with the clock-mode switch (S-21), and the foul stops it again.
    expect(await send(t, [{ type: 'clock-mode', mode: 'stop' }, foul])).toEqual([
      'accepted',
      'accepted',
    ]);
    expect(savedState(t).clock.running).toBe(false);
    expect(await deviceState(t)).toEqual(savedState(t));
  });

  it('without a mercy lead the same lead changes nothing', async () => {
    const t = setUp(seasonRules());
    const three: Input = { type: 'score', side: 'home', playerId: scorer, points: 3 };
    await send(t, [...tipOff, { type: 'start' }, three, three, three]);
    expect(basketball.derive(savedState(t)).clockMode).toBe('stop');
  });
});

describe('the last-minutes stop clock reaches the engine (step 2.122, S-28)', () => {
  const running = (lastSeconds: number | null) =>
    seasonRules((r) => {
      r.clock = {
        mode: 'running',
        stopClockLastSeconds: lastSeconds,
        stopClockScope: 'period',
        mercyLead: null,
      };
    });

  it('under a running clock a foul in the season’s last seconds stops the clock', async () => {
    const t = setUp(running(60));
    await send(t, [...tipOff, { type: 'start' }, foul]);
    // Outside the window a foul leaves the running clock running.
    expect(savedState(t).clock.running).toBe(true);
    await send(t, [{ type: 'set-clock', ms: 30_000 }, { type: 'start' }, foul]);
    const state = savedState(t);
    expect(state.rules).toMatchObject({ stopClockLastSeconds: 60, stopClockScope: 'period' });
    expect(state.clock.running).toBe(false);
    expect(state.plays.at(-1)).toMatchObject({ type: 'foul', stoppedClock: true });
  });

  it('without it the same foul leaves the clock running', async () => {
    const t = setUp(running(null));
    await send(t, [...tipOff, { type: 'set-clock', ms: 30_000 }, { type: 'start' }, foul]);
    expect(savedState(t).clock.running).toBe(true);
  });
});

describe('the platform’s command shape at the door (T-128, record 062)', () => {
  it('takes the clock-mode switch and saves it as a play and an event', async () => {
    const t = setUp(seasonRules());
    expect(
      await send(t, [...tipOff, { type: 'start' }, { type: 'clock-mode', mode: 'running' }]),
    ).toEqual(Array(4).fill('accepted'));
    const state = savedState(t);
    expect(state.plays.at(-1)).toMatchObject({ type: 'clock-mode', mode: 'running' });
    expect(basketball.derive(state).clockMode).toBe('running');
    expect(t.db.state.events.at(-1)).toMatchObject({
      gameId,
      type: 'clock-mode',
      payload: { mode: 'running' },
    });
    // Undone like any play.
    await send(t, [{ type: 'undo' }]);
    expect(basketball.derive(savedState(t)).clockMode).toBe('stop');
  });

  it('a switch to the mode already in force is the engine’s refusal, not the batch’s', async () => {
    const t = setUp(seasonRules());
    expect(await send(t, [...tipOff, { type: 'clock-mode', mode: 'stop' }, foul])).toEqual([
      'accepted',
      'accepted',
      'refused',
      'accepted',
    ]);
  });

  it('a version 1 batch is read as it always was: the first tracker’s shape, with no switch (T-127)', async () => {
    const t = setUp(withLimit(4));
    expect(await send(t, [...tipOff, ...fouls(4)], 1)).toEqual(Array(6).fill('accepted'));
    expect(lineOf(savedState(t), fouler)?.fouledOut).toBe(true);
    t.clock.advance(1);
    const switched = await applyTrackerCommands(
      t.as(scorekeeperId),
      {
        gameId,
        protocolVersion: 1,
        sessionId,
        commands: taps([{ type: 'clock-mode', mode: 'running' }]),
      },
      t.deps,
    );
    expect(switched).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
  });

  it('a version 2 batch from the present tracker, taps and a player added at the table, is taken as before', async () => {
    const t = setUp(withLimit(4));
    const walkUp = '4b1c2d3e-4f50-4a6b-8c7d-8e9fa0b1c2d3';
    next += 1;
    const add = {
      commandId: commandUuid(next),
      at: startOfTest + next,
      input: { type: 'add-player', side: 'away', playerId: walkUp, jersey: '33', name: '' },
    } as const;
    t.clock.advance(1);
    const result = await applyTrackerCommands(
      t.as(scorekeeperId),
      {
        gameId,
        protocolVersion: 2,
        sessionId,
        commands: [
          add,
          ...taps([
            { type: 'lineup', side: 'home', playerIds: homeIds },
            { type: 'lineup', side: 'away', playerIds: [walkUp] },
            { type: 'score', side: 'away', playerId: walkUp, points: 2 },
          ]),
        ],
      },
      t.deps,
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        protocolVersion: 2,
        results: [
          { status: 'accepted' },
          { status: 'accepted' },
          { status: 'accepted' },
          { status: 'accepted' },
        ],
      },
    });
  });
});

describe('a game brought over from a tracker without those rules (the transfer; record 062)', () => {
  const mercy = seasonRules((r) => {
    r.clock = { mode: 'stop', stopClockLastSeconds: null, mercyLead: 3 };
  });
  const three: Input = { type: 'score', side: 'home', playerId: scorer, points: 3 };
  /** A stop-clock game's start: a foul stops the clock, and the scorer starts it again. */
  const replayed = () => ({
    gameId,
    protocolVersion: 2,
    sessionId,
    withoutMercyOrLastMinutes: true as const,
    commands: taps([...tipOff, { type: 'start' }, three, foul, { type: 'start' }]),
  });
  const heldBy = (accountId: string) => ({
    grants: [scorekeeperGrant, schedulerGrant],
    sessions: [
      {
        id: sessionId,
        gameId,
        accountId,
        deviceId: 'tracker-transfer',
        since: startOfTest,
        heldUntil: startOfTest + leaseMs,
      },
    ],
  });

  it('is played and kept without the mercy rule, with the foul limit', async () => {
    const t = setUp(mercy, heldBy(schedulerId));
    t.clock.advance(1);
    const result = await applyTrackerCommands(t.as(schedulerId), replayed(), t.deps);
    expect(result.ok && result.value.results.map((r) => r.status)).toEqual(
      Array(6).fill('accepted'),
    );
    const state = savedState(t);
    expect(state.rules.mercyLead).toBeUndefined();
    expect(state.rules.playerFoulLimit).toBe(5);
    // And minutes counted as the tracker counted them when its clock was set (record 077).
    expect(state.rules.minutesFollow).toBeUndefined();
    expect(state.clock.ranMs).toBeUndefined();
    expect(t.db.state.games[0]?.format).toEqual(
      seasonRules((r) => {
        r.clock = { mode: 'stop', stopClockLastSeconds: null, mercyLead: null };
      }),
    );
    // The season keeps its rule for the games scored here.
    expect(t.db.state.seasons[0]?.rules).toEqual(mercy);
  });

  it('the same batch without it meets the mercy rule, and the second start is refused', async () => {
    const t = setUp(mercy, heldBy(schedulerId));
    t.clock.advance(1);
    const { withoutMercyOrLastMinutes: _off, ...plain } = replayed();
    const result = await applyTrackerCommands(t.as(schedulerId), plain, t.deps);
    expect(result.ok && result.value.results.at(-1)?.status).toBe('refused');
    // A game scored here counts minutes on the game clock (S-71).
    expect(savedState(t).rules.minutesFollow).toBe('game-clock');
  });

  it('is only for whoever may also correct the game: a scorekeeper is refused', async () => {
    const t = setUp(mercy);
    t.clock.advance(1);
    const result = await applyTrackerCommands(t.as(scorekeeperId), replayed(), t.deps);
    expect(result).toMatchObject({ ok: false, error: { code: 'not-allowed' } });
    expect(t.db.state.events).toEqual([]);
  });

  it('once ended, it cannot be marked not started, which would bring the two rules back', async () => {
    const t = setUp(mercy, heldBy(schedulerId));
    t.clock.advance(1);
    const batch = replayed();
    const ended = await applyTrackerCommands(
      t.as(schedulerId),
      { ...batch, commands: [...batch.commands, ...taps([{ type: 'pause' }, { type: 'end' }])] },
      t.deps,
    );
    expect(ended.ok && ended.value.results.every((r) => r.status === 'accepted')).toBe(true);
    expect(savedState(t).status).toBe('final');
    const marked = await markNotStarted(
      t.as(schedulerId),
      { gameId, sequence: lastSequence(t) },
      t.deps,
    );
    expect(marked).toMatchObject({ ok: false, error: { code: 'game-final' } });
    expect(savedState(t).rules.mercyLead).toBeUndefined();
    expect(t.db.state.games[0]?.format).toMatchObject({ clock: { mercyLead: null } });
  });
});

/** The game's last event, or its state's number: what marking it not started names. */
const lastSequence = (t: ReturnType<typeof setUp>) =>
  Math.max(
    0,
    ...t.db.state.states.filter((s) => s.gameId === gameId).map((s) => s.seq),
    ...t.db.state.events.filter((e) => e.gameId === gameId).map((e) => e.seq),
  );

describe('a game marked not started (step 2.121) takes the season’s rules as they stand', () => {
  it('started under a limit of six, marked not started, started again under four: out at four', async () => {
    const t = setUp(withLimit(6));
    await send(t, [...tipOff, { type: 'start' }]);
    expect(savedState(t).rules.playerFoulLimit).toBe(6);
    expect(t.db.state.games[0]?.format).toEqual(withLimit(6));
    const season = t.db.state.seasons[0];
    if (season === undefined) throw new Error('no season');
    season.rules = withLimit(4);

    t.clock.advance(1);
    const marked = await markNotStarted(
      t.as(scorekeeperId),
      { gameId, sequence: lastSequence(t) },
      t.deps,
    );
    expect(marked.ok).toBe(true);
    expect(savedState(t).rules.playerFoulLimit).toBe(4);
    expect((await deviceState(t)).rules.playerFoulLimit).toBe(4);

    // Its session ended with it: the scorekeeper opens the game again and plays it.
    const opened = await openScoringSession(
      t.as(scorekeeperId),
      { gameId, deviceId: 'tablet' },
      t.deps,
    );
    const again = opened.ok && opened.value.status === 'held-by-you' ? opened.value : undefined;
    if (again === undefined) throw new Error('not opened again');
    t.clock.advance(1);
    const result = await applyTrackerCommands(
      t.as(scorekeeperId),
      {
        gameId,
        protocolVersion: 2,
        sessionId: again.sessionId,
        commands: taps([...tipOff, ...fouls(4)]),
      },
      t.deps,
    );
    expect(result.ok && result.value.results.every((r) => r.status === 'accepted')).toBe(true);
    expect(lineOf(savedState(t), fouler)).toMatchObject({ fouls: 4, fouledOut: true });
    expect(t.db.state.games[0]?.format).toEqual(withLimit(4));
  });
});
