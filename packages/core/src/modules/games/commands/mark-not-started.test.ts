// Marking a game not started (step 2.121, S-40, record 061): both sides of the line,
// each with its refusal; the events kept; the game scheduled with no score, lines or
// rules of its own; the session ended, so another device's waiting taps are refused;
// and the game starting again cleanly under its season's rules. The same against the
// real database, with the standings, is in packages/database
// (stores/mark-not-started-commands.test.ts).
import { seasonRulesPreset, type TrackerCommand } from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { engineRulesOf } from '../engine-rules.ts';
import {
  awayTeamId,
  finalGame,
  game,
  gameUuid,
  homeTeamId,
  ownerId,
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

const gameId = gameUuid(1);
const sessionId = sessionUuid(1);
const homeIds = [1, 2, 3, 4, 5].map(
  (n) => `01900000-0000-7000-8000-00000001${String(n).padStart(4, '0')}`,
);
const awayIds = [1, 2, 3, 4, 5].map(
  (n) => `01900000-0000-7000-8000-00000002${String(n).padStart(4, '0')}`,
);
const commandUuid = (n: number) => `01900000-0000-7000-8000-0000c0${String(n).padStart(6, '0')}`;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

type Input = TrackerCommand['input'];

/** A league whose season plays quarters, with one game held by the scorekeeper's tablet. */
function setUp(state: Partial<MemoryTracker> = {}) {
  return memoryTracker({
    seasons: [{ id: seasonId, programId: 'p1', rules: seasonRulesPreset('high-school') }],
    games: [game(1, { captureMode: 'live' })],
    grants: [scorekeeperGrant, schedulerGrant],
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

type Tracker = ReturnType<typeof setUp>;

let next = 1;
/** Sends taps through the tracker's door with the session given. */
async function send(t: Tracker, inputs: readonly Input[], session = sessionId) {
  const commands = inputs.map((input) => {
    next += 1;
    return { commandId: commandUuid(next), at: t.clock.now(), input };
  });
  const result = await applyTrackerCommands(
    t.as(scorekeeperId),
    { gameId, protocolVersion: 1, sessionId: session, commands },
    t.deps,
  );
  if (!result.ok) throw new Error(`batch refused: ${JSON.stringify(result)}`);
  return result.value;
}

async function tap(t: Tracker, inputs: readonly Input[], session = sessionId) {
  const reply = await send(t, inputs, session);
  if (reply.results.some((r) => r.status !== 'accepted')) {
    throw new Error(`taps not taken: ${JSON.stringify(reply)}`);
  }
}

const tipOff: Input[] = [
  { type: 'lineup', side: 'home', playerIds: homeIds },
  { type: 'lineup', side: 'away', playerIds: awayIds },
  { type: 'start' },
];
const basket: Input = { type: 'score', side: 'home', playerId: homeIds[0] ?? '', points: 2 };

const sequenceOf = (t: Tracker) => t.db.state.states.find((s) => s.gameId === gameId)?.seq ?? 0;
const stateOf = (t: Tracker) =>
  t.db.state.states.find((s) => s.gameId === gameId)?.state as basketball.GameState;
const gameOf = (t: Tracker) => t.db.state.games.find((g) => g.id === gameId);

const mark = (t: Tracker, as: string, fields: { reason?: string; sequence?: number } = {}) =>
  markNotStarted(t.as(as), { gameId, sequence: sequenceOf(t), ...fields }, t.deps);

describe('marking a game not started, with only lineups and clock taps (S-40)', () => {
  it('lets its scorekeeper put it back to scheduled, clearing everything and keeping the log', async () => {
    const t = setUp();
    await tap(t, tipOff);
    t.clock.advance(30);
    await tap(t, [{ type: 'pause' }, { type: 'colors', swapped: true }, basket, { type: 'undo' }]);
    expect(gameOf(t)).toMatchObject({ status: 'live', homeScore: 0, awayScore: 0 });
    expect(gameOf(t)?.format).not.toBeNull();
    const logged = structuredClone(t.db.state.events);
    // Someone on the tablet's team scored and was undone: a line is there to clear.
    expect(t.db.state.liveLines.length).toBeGreaterThan(0);

    const result = await mark(t, scorekeeperId);
    expect(result).toEqual({ ok: true, value: { sequence: 8, version: 3 } });

    // The game: scheduled, no score, no rules of its own.
    expect(gameOf(t)).toMatchObject({
      status: 'scheduled',
      homeScore: null,
      awayScore: null,
      format: null,
      finalizedAt: null,
    });
    // The log: every tap as it was, then the marker naming the last one cleared.
    const events = t.db.state.events;
    expect(events.slice(0, 7)).toEqual(logged);
    const marker = events.at(-1);
    expect(marker).toMatchObject({
      seq: 8,
      type: 'reset',
      payload: { clearedThrough: 7 },
      accountId: scorekeeperId,
      tappedAt: t.clock.now(),
    });
    expect(marker?.commandId).toMatch(uuidPattern);
    // The state: a new game at the marker's number, the jersey colors kept.
    expect(sequenceOf(t)).toBe(8);
    const state = stateOf(t);
    expect(state).toMatchObject({ status: 'scheduled', plays: [], redo: [], colorsSwapped: true });
    expect(state.clock).toMatchObject({ running: false, elapsedMs: 0 });
    // Lines gone, session ended, logged with who.
    expect(t.db.state.liveLines).toEqual([]);
    expect(t.db.state.sessions).toEqual([]);
    expect(t.db.state.activity).toEqual([
      expect.objectContaining({
        actorAccountId: scorekeeperId,
        action: 'games.mark_not_started',
        targetType: 'game',
        targetId: gameId,
        summary: 'activity.games.mark_not_started',
        details: { clearedThrough: 7 },
      }),
    ]);
    // Nothing is announced: standings never counted a game that was only live.
    expect(t.events).toEqual([]);
  });

  it('keeps a reason when one is given, though none is needed', async () => {
    const t = setUp();
    await tap(t, tipOff);
    expect(await mark(t, scorekeeperId, { reason: 'Only trying the tracker' })).toMatchObject({
      ok: true,
    });
    expect(t.db.state.activity[0]?.details).toEqual({
      clearedThrough: 3,
      reason: 'Only trying the tracker',
    });
  });

  it('takes its season’s rules again, as they stand, and starts again cleanly', async () => {
    const t = setUp();
    await tap(t, tipOff);
    const started = gameOf(t)?.format as { gameFormat: { periods: number } };
    expect(started.gameFormat.periods).toBe(4);
    // The season moves to halves: the live game keeps its quarters (S-1).
    const halves = seasonRulesPreset('rec-league');
    expect(halves.gameFormat.periods).toBe(2);
    const season = t.db.state.seasons[0];
    if (season === undefined) throw new Error('no season');
    season.rules = halves;
    await tap(t, [{ type: 'pause' }]);
    expect(stateOf(t).rules.periods).toBe(4);

    await mark(t, scorekeeperId);
    expect(stateOf(t).rules).toEqual(engineRulesOf(halves));
    expect(stateOf(t).clock.remainingMs).toBe(basketball.periodMs(engineRulesOf(halves), 1));

    // The tablet opens it again: a new session, and the game starts under the halves.
    const opened = await openScoringSession(
      t.as(scorekeeperId),
      { gameId, deviceId: 'tablet' },
      t.deps,
    );
    if (!opened.ok || opened.value.status !== 'held-by-you') throw new Error('not opened');
    await tap(t, [...tipOff, basket], opened.value.sessionId);
    expect(gameOf(t)).toMatchObject({ status: 'live', homeScore: 2, awayScore: 0 });
    expect((gameOf(t)?.format as { gameFormat: { periods: number } }).gameFormat.periods).toBe(2);
    expect(stateOf(t).plays.map((p) => p.type)).toEqual(['lineup', 'lineup', 'score']);
    // The log runs on from the marker, with no gap.
    expect(t.db.state.events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('refuses another device’s waiting taps afterwards, as the server’s own refusal', async () => {
    const t = setUp();
    await tap(t, tipOff);
    // The scorekeeper's phone, signed in as the same account, marks it not started
    // while the tablet still holds the game with taps it has not sent.
    expect(await mark(t, scorekeeperId)).toMatchObject({ ok: true });
    const reply = await send(t, [basket, { type: 'pause' }]);
    expect(reply.results.map((r) => r.status)).toEqual(['refused', 'refused']);
    expect(reply.results[0]).toMatchObject({ reason: { code: 'session-not-held' } });
    expect(gameOf(t)?.status).toBe('scheduled');
    expect(sequenceOf(t)).toBe(4);
    // A tap the server took before is still answered as taken, never as new.
    const again = await applyTrackerCommands(
      t.as(scorekeeperId),
      {
        gameId,
        protocolVersion: 1,
        sessionId,
        commands: [{ commandId: t.db.state.events[0]?.commandId ?? '', at: 0, input: tipOff[0] }],
      },
      t.deps,
    );
    expect(again).toMatchObject({ ok: true, value: { results: [{ status: 'duplicate' }] } });
  });
});

describe('marking a game not started once something is recorded (S-40)', () => {
  it('refuses the scorekeeper, changing nothing', async () => {
    const t = setUp();
    await tap(t, [...tipOff, basket]);
    const before = structuredClone(t.db.state);
    expect(await mark(t, scorekeeperId, { reason: 'Wrong game' })).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
    expect(t.db.state).toEqual(before);
  });

  it('counts each of a basket, a foul, a turnover and a team turnover, while it stands', async () => {
    const plays: Input[] = [
      basket,
      { type: 'foul', side: 'away', playerId: awayIds[0] ?? '' },
      { type: 'turnover', side: 'home', playerId: homeIds[1] ?? '' },
      { type: 'team-turnover', side: 'away' },
    ];
    for (const play of plays) {
      const t = setUp();
      await tap(t, [...tipOff, play]);
      expect(await mark(t, scorekeeperId), play.type).toMatchObject({
        ok: false,
        error: { code: 'not-allowed' },
      });
      await tap(t, [{ type: 'undo' }]);
      expect(await mark(t, scorekeeperId), play.type).toMatchObject({ ok: true });
    }
  });

  it('asks someone who may correct games for a reason, then clears it and logs the reason', async () => {
    const t = setUp();
    await tap(t, [...tipOff, basket]);
    expect(gameOf(t)).toMatchObject({ homeScore: 2 });
    // The scheduler is on another device than the tablet: while the tablet's lease
    // runs, it may still be scoring (as for ending, record 038).
    expect(await mark(t, schedulerId, { reason: 'Wrong game started' })).toEqual({
      ok: false,
      error: { code: 'session-held' },
    });
    t.clock.advance(leaseMs / 1000);
    expect(await mark(t, schedulerId)).toEqual({ ok: false, error: { code: 'reason-needed' } });
    expect(await mark(t, schedulerId, { reason: '   ' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    const result = await mark(t, schedulerId, { reason: 'Wrong game started' });
    expect(result).toMatchObject({ ok: true, value: { sequence: 5 } });
    expect(gameOf(t)).toMatchObject({ status: 'scheduled', homeScore: null, format: null });
    expect(t.db.state.events.map((e) => e.type)).toEqual([
      'lineup',
      'lineup',
      'start',
      'score',
      'reset',
    ]);
    expect(t.db.state.activity[0]).toMatchObject({
      actorAccountId: schedulerId,
      details: { clearedThrough: 4, reason: 'Wrong game started' },
    });
    expect(t.db.state.liveLines).toEqual([]);
  });

  it('lets the owner do it too', async () => {
    const t = setUp();
    await tap(t, [...tipOff, basket]);
    t.clock.advance(leaseMs / 1000);
    expect(await mark(t, ownerId, { reason: 'Practice run' })).toMatchObject({ ok: true });
  });
});

describe('what cannot be marked not started', () => {
  it('a game that has not started, with its own refusal', async () => {
    const t = setUp();
    expect(await mark(t, scorekeeperId)).toEqual({
      ok: false,
      error: { code: 'game-not-started' },
    });
    await tap(t, tipOff.slice(0, 2));
    // Lineups only: the game is still scheduled.
    expect(await mark(t, scorekeeperId)).toEqual({
      ok: false,
      error: { code: 'game-not-started' },
    });
  });

  it('a game the tracker ended: that is reopening', async () => {
    const t = setUp();
    await tap(t, [...tipOff, basket, { type: 'end' }]);
    expect(gameOf(t)?.status).toBe('final');
    expect(await mark(t, ownerId, { reason: 'Wrong game' })).toEqual({
      ok: false,
      error: { code: 'game-final' },
    });
  });

  it('a final score, box score or forfeit entered by hand, a postponed or cancelled game', async () => {
    const cases = [
      [finalGame(1), 'entered-by-hand'],
      [finalGame(1, { captureMode: 'box' }), 'entered-by-hand'],
      [finalGame(1, { status: 'forfeit', homeScore: 20, awayScore: 0 }), 'entered-by-hand'],
      [game(1, { status: 'postponed' }), 'game-postponed'],
      [game(1, { status: 'cancelled' }), 'game-cancelled'],
      [game(1, { status: 'live', homeScore: 0, awayScore: 0, format: {} }), 'not-tracked'],
    ] as const;
    for (const [record, code] of cases) {
      const t = setUp({ games: [record] });
      expect(await mark(t, ownerId, { reason: 'Wrong game' }), code).toEqual({
        ok: false,
        error: { code },
      });
    }
  });

  it('a game whose plays moved on since the asker saw them', async () => {
    const t = setUp();
    await tap(t, tipOff);
    expect(await mark(t, scorekeeperId, { sequence: 2 })).toEqual({
      ok: false,
      error: { code: 'changed-since-read' },
    });
  });

  it('a game that is not there, in the bin, or of another league', async () => {
    const t = setUp();
    const missing = await markNotStarted(
      t.as(ownerId),
      { gameId: gameUuid(9), sequence: 0 },
      t.deps,
    );
    expect(missing).toEqual({ ok: false, error: { code: 'game-not-found' } });
    const binned = setUp({ games: [game(1, { captureMode: 'live', binned: true })] });
    expect(await mark(binned, ownerId)).toEqual({ ok: false, error: { code: 'game-not-found' } });
  });

  it('anything, for someone who may not score the game or is signed out', async () => {
    const t = setUp();
    await tap(t, tipOff);
    for (const as of ['01900000-0000-7000-8000-0000000000ff', null]) {
      const result = await markNotStarted(t.as(as), { gameId, sequence: sequenceOf(t) }, t.deps);
      expect(result).toEqual({ ok: false, error: { code: 'not-allowed' } });
    }
    expect(gameOf(t)?.status).toBe('live');
  });
});
