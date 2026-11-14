// Ending a tracked game and reopening it (step 2.30, T6 §7 and §8): the end is all or
// nothing, a reopened game goes back to its tracker, and ending it again gives one
// correct result. The same against the real database, with the standings, is in
// packages/database (stores/tracked-game-end-commands.test.ts).
import { seasonRulesPreset, type TrackerCommand } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import {
  awayTeamId,
  editorGrant,
  editorId,
  finalGame,
  game,
  gameUuid,
  homeTeamId,
  leagueId,
  ownerId,
  scorekeeperGrant,
  scorekeeperId,
  seasonId,
} from '../memory-games.test-helper.ts';
import { sessionUuid, startOfTest } from '../memory-scoring.test-helper.ts';
import { memoryTracker, type MemoryTracker } from '../memory-tracker.test-helper.ts';
import type { EventHandler } from '../../../command/index.ts';
import type { GamePlayer, TrackerTx } from '../ports.ts';
import { leaseMs } from '../scoring-session.ts';
import { applyTrackerCommands } from './apply-tracker-commands.ts';
import { endTrackedGame } from './end-tracked-game.ts';
import { reopenGame } from './reopen-game.ts';

const gameId = gameUuid(1);
const sessionId = sessionUuid(1);
const homeIds = [1, 2, 3, 4, 5, 6].map(
  (n) => `01900000-0000-7000-8000-00000001${String(n).padStart(4, '0')}`,
);
const awayIds = [1, 2, 3, 4, 5, 6].map(
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

/** A league with one live-tracked game held by the scorekeeper's tablet. */
function setUp(state: Partial<MemoryTracker> = {}, handlers: EventHandler<TrackerTx>[] = []) {
  return memoryTracker(
    {
      seasons: [{ id: seasonId, programId: 'p1', rules: seasonRulesPreset('high-school') }],
      games: [game(1, { captureMode: 'live' })],
      grants: [scorekeeperGrant, editorGrant],
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
    },
    handlers,
  );
}

type Tracker = ReturnType<typeof setUp>;

/** Sends taps through the tracker's door, numbered from `first`. */
async function tap(t: Tracker, inputs: readonly Input[], first: number) {
  const commands = inputs.map((input, i) => ({
    commandId: commandUuid(first + i),
    at: startOfTest + (first + i) * 1000,
    input,
  }));
  const result = await applyTrackerCommands(
    t.as(scorekeeperId),
    { gameId, protocolVersion: 1, sessionId, commands },
    t.deps,
  );
  if (!result.ok || result.value.results.some((r) => r.status !== 'accepted')) {
    throw new Error(`taps not taken: ${JSON.stringify(result)}`);
  }
}

const tipOff: Input[] = [
  { type: 'lineup', side: 'home', playerIds: homeIds.slice(0, 5) },
  { type: 'lineup', side: 'away', playerIds: awayIds.slice(0, 5) },
  { type: 'start' },
];

/** A game under way: home 5, away 2. */
async function underWay(t: Tracker) {
  await tap(
    t,
    [
      ...tipOff,
      { type: 'score', side: 'home', playerId: homeIds[0] ?? '', points: 3 },
      { type: 'score', side: 'home', playerId: homeIds[1] ?? '', points: 2 },
      { type: 'score', side: 'away', playerId: awayIds[0] ?? '', points: 2 },
    ],
    1,
  );
}

/** The tablet's lease runs out: the game's session holds nothing any more. */
const lapse = (t: Tracker) => t.clock.advance(leaseMs / 1000);

const versionOf = (t: Tracker) => t.db.state.games[0]?.version ?? 0;
const lineOf = (t: Tracker, personId: string | undefined) =>
  t.db.state.liveLines.find((l) => l.personId === personId);

describe('ending a tracked game (T6 §7)', () => {
  it('ends it in one go: the end event, final with its scores, lines settled, logged and announced', async () => {
    const t = setUp();
    await underWay(t);
    t.clock.advance(600);
    const result = await endTrackedGame(t.as(ownerId), { gameId, version: versionOf(t) }, t.deps);
    expect(result).toEqual({ ok: true, value: { version: 3 } });
    const s = t.db.state;
    expect(s.games[0]).toMatchObject({ status: 'final', homeScore: 5, awayScore: 2 });
    expect(s.games[0]?.finalizedAt).not.toBeNull();
    const end = s.events.at(-1);
    expect(end).toMatchObject({ seq: 7, type: 'end', payload: {}, accountId: ownerId });
    expect(end?.commandId).toMatch(uuidPattern);
    expect(s.states[0]).toMatchObject({ seq: 7, state: { status: 'final' } });
    // Who played, their time, and the two on the benches as did-not-play.
    expect(s.liveLines).toHaveLength(12);
    expect(lineOf(t, homeIds[0])).toMatchObject({ played: true, stats: { points: 3 } });
    expect(lineOf(t, homeIds[5])).toEqual({
      gameId,
      teamId: homeTeamId,
      personId: homeIds[5],
      jerseyNumber: '15',
      played: false,
      secondsPlayed: 0,
      stats: {},
    });
    expect(s.activity.map((a) => a.action)).toEqual(['games.end_tracked_game']);
    expect(t.events).toEqual([{ type: 'games.finalized', leagueId, gameId, seasonId }]);
  });

  it('is all or nothing: when the standings fail, nothing of the end is saved', async () => {
    const failing: EventHandler<TrackerTx> = {
      type: 'games.finalized',
      handle: async () => {
        throw new Error('standings could not be saved');
      },
    };
    const t = setUp({}, [failing]);
    await underWay(t);
    lapse(t);
    const before = structuredClone(t.db.state);
    await expect(
      endTrackedGame(t.as(ownerId), { gameId, version: versionOf(t) }, t.deps),
    ).rejects.toThrow('standings could not be saved');
    expect(t.db.state).toEqual(before);
  });

  it('refuses what cannot be ended, and changes nothing', async () => {
    const t = setUp({
      games: [
        game(1, { captureMode: 'live' }),
        game(2, { captureMode: 'live' }),
        finalGame(3),
        game(4, { status: 'cancelled' }),
        game(5, { status: 'postponed' }),
        game(6, { captureMode: 'live' }),
      ],
    });
    await tap(t, tipOff, 1);
    lapse(t);
    const before = structuredClone(t.db.state);
    const code = async (n: number, version = 1) => {
      const result = await endTrackedGame(t.as(ownerId), { gameId: gameUuid(n), version }, t.deps);
      return result.ok ? 'ok' : result.error.code;
    };
    // Line-ups only: the engine ends only a game with something recorded.
    expect(await code(1, versionOf(t))).toBe('nothing-recorded');
    expect(await code(2)).toBe('not-tracked');
    expect(await code(3)).toBe('game-already-decided');
    expect(await code(4)).toBe('game-cancelled');
    expect(await code(5)).toBe('game-not-live');
    expect(await code(6, 2)).toBe('changed-since-read');
    expect(await code(9)).toBe('game-not-found');
    expect(t.db.state).toEqual(before);
  });

  it('refuses a level score unless the season allows ties', async () => {
    const level: Input[] = [
      ...tipOff,
      { type: 'score', side: 'home', playerId: homeIds[0] ?? '', points: 2 },
      { type: 'score', side: 'away', playerId: awayIds[0] ?? '', points: 2 },
    ];
    const t = setUp();
    await tap(t, level, 1);
    lapse(t);
    expect(
      await endTrackedGame(t.as(ownerId), { gameId, version: versionOf(t) }, t.deps),
    ).toMatchObject({ error: { code: 'tie-not-allowed' } });
    expect(t.db.state.games[0]?.status).toBe('live');

    const ties = setUp({
      seasons: [
        {
          id: seasonId,
          programId: 'p1',
          rules: { ...seasonRulesPreset('high-school'), allowTies: true },
        },
      ],
    });
    await tap(ties, level, 1);
    lapse(ties);
    expect(
      await endTrackedGame(ties.as(ownerId), { gameId, version: versionOf(ties) }, ties.deps),
    ).toMatchObject({ ok: true });
    expect(ties.db.state.games[0]).toMatchObject({ status: 'final', homeScore: 2, awayScore: 2 });
  });

  it('refuses while another account holds the scoring session; the holder may end it', async () => {
    const t = setUp();
    await underWay(t);
    const before = structuredClone(t.db.state);
    // The scorekeeper's tablet holds the game and its lease has not run out.
    expect(await endTrackedGame(t.as(ownerId), { gameId, version: versionOf(t) }, t.deps)).toEqual({
      ok: false,
      error: { code: 'session-held' },
    });
    expect(t.db.state).toEqual(before);
    // The holder's own account may end it from elsewhere.
    expect(
      await endTrackedGame(t.as(scorekeeperId), { gameId, version: versionOf(t) }, t.deps),
    ).toMatchObject({ ok: true });

    // Once the lease has run out, anyone who may score the game may end it.
    const lapsed = setUp();
    await underWay(lapsed);
    lapse(lapsed);
    expect(
      await endTrackedGame(lapsed.as(ownerId), { gameId, version: versionOf(lapsed) }, lapsed.deps),
    ).toMatchObject({ ok: true });
  });

  it('needs games.score: the scorekeeper may, an editor may not', async () => {
    const t = setUp();
    await underWay(t);
    expect(
      await endTrackedGame(t.as(editorId), { gameId, version: versionOf(t) }, t.deps),
    ).toMatchObject({ error: { code: 'not-allowed' } });
    expect(
      await endTrackedGame(t.as(scorekeeperId), { gameId, version: versionOf(t) }, t.deps),
    ).toMatchObject({ ok: true });
  });
});

describe('reopening a tracked game hands it back to the tracker (T6 §8)', () => {
  it('end, reopen with a reason, fix with the tracker, end again: one correct result', async () => {
    const t = setUp();
    await underWay(t);
    lapse(t);
    await endTrackedGame(t.as(ownerId), { gameId, version: versionOf(t) }, t.deps);

    const reopened = await reopenGame(
      t.as(ownerId),
      { gameId, version: versionOf(t), reason: 'The last basket was the other player’s' },
      t.deps,
    );
    expect(reopened).toMatchObject({ ok: true });
    let s = t.db.state;
    // Live again with the score its plays give, the engine's reopen in the event log.
    expect(s.games[0]).toMatchObject({
      status: 'live',
      homeScore: 5,
      awayScore: 2,
      finalizedAt: null,
    });
    expect(s.events.slice(-2).map((e) => [e.seq, e.type, e.accountId])).toEqual([
      [7, 'end', ownerId],
      [8, 'reopen', ownerId],
    ]);
    expect(s.states[0]).toMatchObject({ seq: 8, state: { status: 'live' } });
    expect(s.corrections).toEqual([
      {
        gameId,
        accountId: ownerId,
        reason: 'The last basket was the other player’s',
        before: { version: 1, status: 'final', homeScore: 5, awayScore: 2 },
        after: { version: 1, status: 'live', homeScore: 5, awayScore: 2 },
      },
    ]);
    // Back to what the plays give: no did-not-play lines while it is live.
    expect(s.liveLines.every((l) => l.played)).toBe(true);
    expect(t.events.map((e) => e.type)).toEqual(['games.finalized', 'games.reopened']);

    // The tracker fixes it with its own tools: undo the away basket, give it to the right player.
    await tap(
      t,
      [{ type: 'undo' }, { type: 'score', side: 'away', playerId: awayIds[1] ?? '', points: 2 }],
      20,
    );
    expect(t.db.state.games[0]).toMatchObject({ status: 'live', homeScore: 5, awayScore: 2 });
    lapse(t);
    await endTrackedGame(t.as(ownerId), { gameId, version: versionOf(t) }, t.deps);

    s = t.db.state;
    expect(s.games[0]).toMatchObject({ status: 'final', homeScore: 5, awayScore: 2 });
    expect(s.events.map((e) => e.type).filter((type) => type === 'end')).toHaveLength(2);
    // The basket moved: the first scorer's line lost it, the right player has it now.
    expect(lineOf(t, awayIds[0])).toMatchObject({ played: true, stats: { points: 0 } });
    expect(lineOf(t, awayIds[1])).toMatchObject({ played: true, stats: { points: 2 } });
    expect(lineOf(t, homeIds[5])).toMatchObject({ played: false });
    expect(lineOf(t, awayIds[5])).toMatchObject({ played: false });
    expect(s.liveLines).toHaveLength(12);
    expect(new Set(s.liveLines.map((l) => l.personId)).size).toBe(12);
    expect(t.events.map((e) => e.type)).toEqual([
      'games.finalized',
      'games.reopened',
      'games.finalized',
    ]);
  });

  it('a tracked game decided by hand goes back to its tracker as its plays left it', async () => {
    const t = setUp();
    await underWay(t);
    const current = t.db.state.games[0];
    if (current === undefined) throw new Error('no game');
    // Decided by hand while the tablet was still live (a final score entered).
    t.db.state.games[0] = {
      ...current,
      status: 'final',
      homeScore: 60,
      awayScore: 50,
      finalizedAt: '2026-12-06T20:00:00.000Z',
      version: current.version + 1,
    };
    const events = t.db.state.events.length;
    await reopenGame(
      t.as(ownerId),
      { gameId, version: current.version + 1, reason: 'Entered by mistake' },
      t.deps,
    );
    expect(t.db.state.games[0]).toMatchObject({ status: 'live', homeScore: 5, awayScore: 2 });
    // Its state was never ended, so there is nothing to reopen in the engine.
    expect(t.db.state.events).toHaveLength(events);
  });
});
