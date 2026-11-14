// The tracker's commands on the server (step 2.29): T6 §11's protocol tests (the same
// command twice, commands after a takeover, a long offline queue replayed, a refused
// command), the game's rules (S-1), the protocol versions (T-127), and forty games at
// once (T-112). The same command against the real database is in packages/database.
import {
  buildVersionRefusal,
  maxCommandsPerBatch,
  seasonRulesPreset,
  type CommandBatch,
  type TrackerCommand,
} from '@srleagues/contracts';
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { engineRulesOf } from '../engine-rules.ts';
import {
  awayTeamId,
  editorGrant,
  editorId,
  game,
  gameUuid,
  homeTeamId,
  rules,
  scorekeeperGrant,
  scorekeeperId,
  seasonId,
} from '../memory-games.test-helper.ts';
import { sessionUuid, startOfTest } from '../memory-scoring.test-helper.ts';
import { leaseMs } from '../scoring-session.ts';
import {
  lockingTracker,
  memoryTracker,
  type MemoryTracker,
} from '../memory-tracker.test-helper.ts';
import type { GamePlayer, ScoringSession } from '../ports.ts';
import { applyTrackerCommands, batchReaders } from './apply-tracker-commands.ts';
import { takeOverScoring } from './take-over-scoring.ts';

const gameId = gameUuid(1);
const sessionId = sessionUuid(1);
const homeIds = [1, 2, 3, 4, 5, 6].map(
  (n) => `01900000-0000-7000-8000-00000001${String(n).padStart(4, '0')}`,
);
const awayIds = [1, 2, 3, 4, 5, 6].map(
  (n) => `01900000-0000-7000-8000-00000002${String(n).padStart(4, '0')}`,
);
/** Someone on neither team. */
const strangerId = '01900000-0000-7000-8000-000000030001';
const commandUuid = (n: number) => `01900000-0000-7000-8000-0000c0${String(n).padStart(6, '0')}`;

const roster: GamePlayer[] = [
  ...homeIds.map((personId, i) => ({ personId, teamId: homeTeamId, jerseyNumber: String(i + 10) })),
  ...awayIds.map((personId, i) => ({ personId, teamId: awayTeamId, jerseyNumber: String(i + 20) })),
];

const holdingSession = (fields: Partial<ScoringSession> = {}): ScoringSession => ({
  id: sessionId,
  gameId,
  accountId: scorekeeperId,
  deviceId: 'tablet',
  since: startOfTest,
  heldUntil: startOfTest + leaseMs,
  ...fields,
});

/** A league with one game to score, held by the scorekeeper's tablet. */
function setUp(state: Partial<MemoryTracker> = {}) {
  return memoryTracker({
    seasons: [{ id: seasonId, programId: 'p1', rules: seasonRulesPreset('high-school') }],
    games: [game(1, { captureMode: 'live' })],
    grants: [scorekeeperGrant, editorGrant],
    sessions: [holdingSession()],
    players: roster,
    ...state,
  });
}

type Input = TrackerCommand['input'];

/** Numbered commands, tapped a second apart from `from`. */
function taps(inputs: readonly Input[], first = 1, from = startOfTest): TrackerCommand[] {
  return inputs.map((input, i) => ({
    commandId: commandUuid(first + i),
    at: from + i * 1000,
    input,
  }));
}

const batchOf = (commands: TrackerCommand[], fields: Partial<CommandBatch> = {}) => ({
  gameId,
  protocolVersion: 1,
  sessionId,
  commands,
  ...fields,
});

const tipOff: Input[] = [
  { type: 'lineup', side: 'home', playerIds: homeIds.slice(0, 5) },
  { type: 'lineup', side: 'away', playerIds: awayIds.slice(0, 5) },
  { type: 'start' },
];

const statuses = (result: Awaited<ReturnType<typeof applyTrackerCommands>>) =>
  result.ok ? result.value.results.map((r) => r.status) : result.error.code;

describe('applying the tracker’s commands (T-111, T6 §1)', () => {
  it('applies a batch in order and saves the events, the state, the score and the lines together', async () => {
    const t = setUp();
    t.clock.advance(60);
    const commands = taps(
      [...tipOff, { type: 'score', side: 'home', playerId: homeIds[0] ?? '', points: 3 }],
      1,
      startOfTest + 50_000,
    );
    const result = await applyTrackerCommands(t.as(scorekeeperId), batchOf(commands), t.deps);
    expect(result).toEqual({
      ok: true,
      value: {
        protocolVersion: 1,
        sequence: 4,
        results: commands.map((c) => ({ commandId: c.commandId, status: 'accepted' })),
      },
    });
    const s = t.db.state;
    expect(s.events.map((e) => [e.seq, e.type, e.commandId])).toEqual(
      commands.map((c, i) => [i + 1, c.input.type, c.commandId]),
    );
    expect(s.events[0]).toEqual({
      gameId,
      seq: 1,
      commandId: commandUuid(1),
      type: 'lineup',
      payload: { side: 'home', playerIds: homeIds.slice(0, 5) },
      tappedAt: startOfTest + 50_000,
      accountId: scorekeeperId,
    });
    expect(s.states).toEqual([
      { gameId, seq: 4, state: expect.objectContaining({ status: 'live' }) },
    ]);
    expect(s.games[0]).toMatchObject({ status: 'live', homeScore: 3, awayScore: 0, version: 2 });
    // Every player on the floor has a line; the shooter's has the basket.
    expect(s.liveLines).toHaveLength(10);
    expect(s.liveLines.find((l) => l.personId === homeIds[0])).toEqual({
      gameId,
      teamId: homeTeamId,
      personId: homeIds[0],
      jerseyNumber: '10',
      played: true,
      secondsPlayed: 1,
      stats: { points: 3, fg1: 0, fg2: 0, fg3: 1, fouls: 0, turnovers: 0 },
    });
  });

  it('the same command sent twice is answered duplicate and counts once', async () => {
    const t = setUp();
    const basket = taps([
      ...tipOff,
      { type: 'score', side: 'away', playerId: awayIds[1] ?? '', points: 2 },
    ]);
    await applyTrackerCommands(t.as(scorekeeperId), batchOf(basket), t.deps);
    const before = structuredClone(t.db.state);
    // The answer was lost; the tablet sends it all again, with one new tap.
    const again = [
      ...basket,
      ...taps([{ type: 'score', side: 'away', playerId: awayIds[1] ?? '', points: 2 }], 10),
    ];
    const result = await applyTrackerCommands(t.as(scorekeeperId), batchOf(again), t.deps);
    expect(statuses(result)).toEqual([
      'duplicate',
      'duplicate',
      'duplicate',
      'duplicate',
      'accepted',
    ]);
    expect(result).toMatchObject({ value: { sequence: 5 } });
    expect(t.db.state.games[0]).toMatchObject({ awayScore: 4 });
    expect(t.db.state.events).toHaveLength(5);
    // Sent once more: nothing at all changes.
    const third = await applyTrackerCommands(t.as(scorekeeperId), batchOf(again), t.deps);
    expect(statuses(third)).toEqual(Array(5).fill('duplicate'));
    expect(before.events).toHaveLength(4);
    expect(t.db.state.events).toHaveLength(5);
    expect(t.db.state.games[0]?.version).toBe(3);
  });

  it('a command ID twice in one batch is turned away before anything is applied', async () => {
    const t = setUp();
    const [first] = taps([{ type: 'start' }]);
    const result = await applyTrackerCommands(
      t.as(scorekeeperId),
      batchOf(first === undefined ? [] : [first, first]),
      t.deps,
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(t.db.state.events).toEqual([]);
  });

  it('a refused command gets its reason, and the rest of the batch still applies (T-113)', async () => {
    const t = setUp();
    const commands = taps([
      ...tipOff,
      // The sixth home player is on the bench: he cannot come off.
      { type: 'sub', side: 'home', inId: homeIds[0] ?? '', outId: homeIds[5] ?? '' },
      // Someone on neither team.
      { type: 'foul', side: 'away', playerId: strangerId },
      // A home player named for the away side.
      { type: 'score', side: 'away', playerId: homeIds[0] ?? '', points: 2 },
      { type: 'score', side: 'home', playerId: homeIds[1] ?? '', points: 2 },
    ]);
    const result = await applyTrackerCommands(t.as(scorekeeperId), batchOf(commands), t.deps);
    expect(result.ok && result.value.results.slice(3)).toEqual([
      {
        commandId: commandUuid(4),
        status: 'refused',
        reason: { code: 'rule', message: 'The player coming off is not on the floor.' },
      },
      {
        commandId: commandUuid(5),
        status: 'refused',
        reason: { code: 'rule', message: 'That player is not on this team. Reload the roster.' },
      },
      {
        commandId: commandUuid(6),
        status: 'refused',
        reason: { code: 'rule', message: 'That player is not on this team. Reload the roster.' },
      },
      { commandId: commandUuid(7), status: 'accepted' },
    ]);
    // Only the taken commands are events, numbered with no gaps.
    expect(t.db.state.events.map((e) => [e.seq, e.commandId])).toEqual([
      [1, commandUuid(1)],
      [2, commandUuid(2)],
      [3, commandUuid(3)],
      [4, commandUuid(7)],
    ]);
    expect(result).toMatchObject({ value: { sequence: 4 } });
    expect(t.db.state.games[0]).toMatchObject({ homeScore: 2, awayScore: 0 });
    // A refused command was never taken: sent again it is judged again, not a duplicate.
    const again = await applyTrackerCommands(
      t.as(scorekeeperId),
      batchOf(commands.slice(3, 4)),
      t.deps,
    );
    expect(statuses(again)).toEqual(['refused']);
  });

  it('a batch where nothing is taken changes nothing', async () => {
    const t = setUp();
    const result = await applyTrackerCommands(
      t.as(scorekeeperId),
      batchOf(taps([{ type: 'pause' }])),
      t.deps,
    );
    expect(result).toMatchObject({
      value: {
        sequence: 0,
        results: [
          { status: 'refused', reason: { code: 'rule', message: 'The clock is not running.' } },
        ],
      },
    });
    expect(t.db.state.states).toEqual([]);
    expect(t.db.state.games[0]).toMatchObject({ status: 'scheduled', format: null, version: 1 });
  });

  it('the rules, ending and reopening are not taken through the tracker’s door', async () => {
    const t = setUp();
    const result = await applyTrackerCommands(
      t.as(scorekeeperId),
      batchOf(
        taps([
          // The Al-Hadi tracker's halves, as its format picker sends them.
          { type: 'rules', rules: { ...basketball.HALVES } },
          { type: 'end' },
          { type: 'reopen' },
        ]),
      ),
      t.deps,
    );
    expect(
      result.ok && result.value.results.map((r) => r.status === 'refused' && r.reason),
    ).toEqual([
      { code: 'rule', message: 'The game’s rules come from the league’s settings.' },
      { code: 'rule', message: 'Ending a game is not taken here yet.' },
      { code: 'rule', message: 'Reopening a game is not taken here yet.' },
    ]);
  });

  it('a player sent in capitals is the same player: one line, nothing wiped', async () => {
    const t = setUp();
    const id = homeIds[0] ?? '';
    await applyTrackerCommands(
      t.as(scorekeeperId),
      batchOf(
        taps([
          { type: 'score', side: 'home', playerId: id.toUpperCase(), points: 2 },
          { type: 'score', side: 'home', playerId: id, points: 3 },
        ]),
      ),
      t.deps,
    );
    expect(t.db.state.liveLines).toHaveLength(1);
    expect(t.db.state.liveLines[0]).toMatchObject({ personId: id, stats: { points: 5 } });
    expect(t.db.state.events[0]?.payload).toMatchObject({ playerId: id });
  });

  it('undoing a player’s only play removes their line', async () => {
    const t = setUp();
    await applyTrackerCommands(
      t.as(scorekeeperId),
      batchOf(taps([{ type: 'score', side: 'home', playerId: homeIds[5] ?? '', points: 2 }])),
      t.deps,
    );
    expect(t.db.state.liveLines.map((l) => l.personId)).toEqual([homeIds[5]]);
    await applyTrackerCommands(t.as(scorekeeperId), batchOf(taps([{ type: 'undo' }], 2)), t.deps);
    expect(t.db.state.liveLines).toEqual([]);
    expect(t.db.state.games[0]).toMatchObject({ status: 'live', homeScore: 0 });
  });

  it('a tap stamped later than the server’s clock counts as now', async () => {
    const t = setUp();
    await applyTrackerCommands(
      t.as(scorekeeperId),
      batchOf(taps([{ type: 'start' }], 1, startOfTest + 3_600_000)),
      t.deps,
    );
    expect(t.db.state.events[0]?.tappedAt).toBe(startOfTest);
  });
});

describe('one scorer at a time (T-116, T6 §5)', () => {
  it('after a takeover the first device’s new commands are refused, its saved ones still duplicate', async () => {
    const t = setUp({
      grants: [scorekeeperGrant, { ...scorekeeperGrant, id: 'g2', accountId: editorId }],
    });
    const first = taps(tipOff);
    await applyTrackerCommands(t.as(scorekeeperId), batchOf(first), t.deps);
    t.clock.advance(30);
    const taken = await takeOverScoring(
      t.as(editorId),
      { gameId, deviceId: 'phone', confirmed: true, expectedHolderSince: startOfTest },
      t.deps,
    );
    const newSession =
      taken.ok && taken.value.status === 'held-by-you' ? taken.value.sessionId : '';
    expect(newSession).not.toBe('');
    // The tablet had not heard back about its first batch and had two taps queued.
    const queued = taps(
      [
        { type: 'score', side: 'home', playerId: homeIds[0] ?? '', points: 2 },
        { type: 'foul', side: 'away', playerId: awayIds[0] ?? '' },
      ],
      10,
    );
    const late = await applyTrackerCommands(
      t.as(scorekeeperId),
      batchOf([...first, ...queued]),
      t.deps,
    );
    expect(late.ok && late.value.results).toEqual([
      ...first.map((c) => ({ commandId: c.commandId, status: 'duplicate' })),
      ...queued.map((c) => ({
        commandId: c.commandId,
        status: 'refused',
        reason: { code: 'session-not-held', message: 'This device no longer holds the game.' },
      })),
    ]);
    expect(t.db.state.events).toHaveLength(3);
    // The new holder carries on from the server's state.
    const carried = await applyTrackerCommands(
      t.as(editorId),
      batchOf(queued, { sessionId: newSession }),
      t.deps,
    );
    expect(statuses(carried)).toEqual(['accepted', 'accepted']);
    expect(t.db.state.events.slice(3).map((e) => e.accountId)).toEqual([editorId, editorId]);
  });

  it('a session someone else’s account holds is refused, and so is a released one', async () => {
    const t = setUp({ sessions: [holdingSession({ accountId: editorId })] });
    const theirs = await applyTrackerCommands(t.as(scorekeeperId), batchOf(taps(tipOff)), t.deps);
    expect(statuses(theirs)).toEqual(['refused', 'refused', 'refused']);
    const none = setUp({ sessions: [] });
    const released = await applyTrackerCommands(
      none.as(scorekeeperId),
      batchOf(taps(tipOff)),
      none.deps,
    );
    expect(released).toMatchObject({
      value: { results: [{ status: 'refused', reason: { code: 'session-not-held' } }, {}, {}] },
    });
  });

  it('a lease that ran out with nobody taking the game still carries the device’s taps (record 036)', async () => {
    const t = setUp();
    t.clock.advance(600);
    const result = await applyTrackerCommands(t.as(scorekeeperId), batchOf(taps(tipOff)), t.deps);
    expect(statuses(result)).toEqual(['accepted', 'accepted', 'accepted']);
  });

  it('someone who may not score the game is not allowed', async () => {
    const t = setUp();
    expect(await applyTrackerCommands(t.as(editorId), batchOf(taps(tipOff)), t.deps)).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
  });
});

describe('which games can be scored', () => {
  it.each(['final', 'forfeit', 'cancelled', 'postponed'])(
    'a %s game refuses every command',
    async (status) => {
      const t = setUp({
        games: [
          game(1, {
            status,
            captureMode: 'live',
            ...(status === 'final' || status === 'forfeit'
              ? {
                  homeScore: 2,
                  awayScore: 0,
                  format: rules(),
                  finalizedAt: '2026-12-06T20:00:00.000Z',
                }
              : {}),
          }),
        ],
      });
      const result = await applyTrackerCommands(t.as(scorekeeperId), batchOf(taps(tipOff)), t.deps);
      expect(result).toMatchObject({
        value: {
          sequence: 0,
          results: [{ status: 'refused', reason: { code: 'game-not-live' } }, {}, {}],
        },
      });
    },
  );

  it('a game not in the league, or in the bin, is unknown', async () => {
    const t = setUp({ games: [game(1, { binned: true })] });
    for (const id of [gameId, gameUuid(99)]) {
      const result = await applyTrackerCommands(
        t.as(scorekeeperId),
        batchOf(taps([{ type: 'start' }]), { gameId: id } as Partial<CommandBatch>),
        t.deps,
      );
      expect(result).toMatchObject({
        value: { results: [{ status: 'refused', reason: { code: 'unknown-game' } }] },
      });
    }
  });
});

describe('the rules a game is played under (S-1)', () => {
  it('starting a game turns the season’s rules into the engine’s, and the game keeps them', async () => {
    const t = setUp();
    await applyTrackerCommands(t.as(scorekeeperId), batchOf(taps(tipOff)), t.deps);
    const state = t.db.state.states[0]?.state as basketball.GameState;
    expect(state.rules).toEqual(engineRulesOf(seasonRulesPreset('high-school')));
    expect(t.db.state.games[0]?.format).toEqual(seasonRulesPreset('high-school'));
    // The admin moves the season to halves: the game under way stays in quarters.
    const season = t.db.state.seasons[0];
    if (season !== undefined) season.rules = seasonRulesPreset('rec-league');
    await applyTrackerCommands(
      t.as(scorekeeperId),
      batchOf(taps([{ type: 'period', period: 2 }], 10)),
      t.deps,
    );
    const later = t.db.state.states[0]?.state as basketball.GameState;
    expect(later.rules.periods).toBe(4);
    expect(later.clock.remainingMs).toBe(8 * 60 * 1000);
    expect(t.db.state.games[0]?.format).toEqual(seasonRulesPreset('high-school'));
  });

  it('a game given rules of its own before it starts is played under them', async () => {
    const own = seasonRulesPreset('rec-league');
    const t = setUp({ games: [game(1, { captureMode: 'live', format: own })] });
    await applyTrackerCommands(t.as(scorekeeperId), batchOf(taps(tipOff)), t.deps);
    const state = t.db.state.states[0]?.state as basketball.GameState;
    expect(state.rules).toEqual(engineRulesOf(own));
    expect(basketball.clockModeOf(state.rules)).toBe('running');
  });

  it('lineups before tip-off fix the rules, though the game is not live yet', async () => {
    const t = setUp();
    await applyTrackerCommands(t.as(scorekeeperId), batchOf(taps(tipOff.slice(0, 2))), t.deps);
    expect(t.db.state.games[0]).toMatchObject({
      status: 'scheduled',
      homeScore: null,
      format: seasonRulesPreset('high-school'),
    });
  });
});

describe('protocol versions (T-127)', () => {
  it('every version the server says it takes has a reader', () => {
    for (const version of buildVersionRefusal().accepted) {
      expect(batchReaders[version], `version ${version}`).toBeDefined();
    }
  });

  it('a version the server does not take turns the whole batch away, naming the ones it does', async () => {
    const t = setUp();
    const result = await applyTrackerCommands(
      t.as(scorekeeperId),
      { ...batchOf(taps(tipOff)), protocolVersion: 2, someNewField: true },
      t.deps,
    );
    expect(result).toEqual({
      ok: false,
      error: { code: 'unsupported-protocol-version', accepted: buildVersionRefusal().accepted },
    });
    expect(t.db.state.events).toEqual([]);
  });

  it('answers in the version the tracker spoke', async () => {
    const t = setUp();
    const result = await applyTrackerCommands(t.as(scorekeeperId), batchOf(taps(tipOff)), t.deps);
    expect(result).toMatchObject({ value: { protocolVersion: 1 } });
  });
});

/** A whole game as a scorer taps it: lineups, then baskets, fouls, subs and periods. */
function scriptedGame(count: number): Input[] {
  const inputs: Input[] = [...tipOff];
  const onFloor = { home: homeIds.slice(0, 5), away: awayIds.slice(0, 5) };
  const bench = { home: homeIds[5] ?? '', away: awayIds[5] ?? '' };
  for (let i = 0; inputs.length < count; i++) {
    const side = i % 2 === 0 ? 'home' : 'away';
    const player = onFloor[side][i % 5] ?? '';
    if (i % 37 === 36) {
      inputs.push({ type: 'sub', side, inId: bench[side], outId: player });
      onFloor[side] = onFloor[side].map((id) => (id === player ? bench[side] : id));
      bench[side] = player;
    } else if (i % 11 === 10) {
      inputs.push({ type: 'foul', side, playerId: player }, { type: 'start' });
    } else if (i % 53 === 52) {
      inputs.push({ type: 'turnover', side, playerId: player }, { type: 'undo' });
    } else {
      inputs.push({ type: 'score', side, playerId: player, points: ((i % 3) + 1) as 1 | 2 | 3 });
    }
  }
  return inputs.slice(0, count);
}

describe('a long offline queue replayed (T6 §4, §11)', () => {
  it('300 taps queued offline arrive in batches and give the same box score as the engine', async () => {
    const t = setUp();
    const queue = taps(scriptedGame(300), 1, startOfTest + 60_000);
    // The tablet comes back online long after the last tap.
    t.clock.advance(3600);
    for (let i = 0; i < queue.length; i += maxCommandsPerBatch) {
      const result = await applyTrackerCommands(
        t.as(scorekeeperId),
        batchOf(queue.slice(i, i + maxCommandsPerBatch)),
        t.deps,
      );
      expect(result.ok && result.value.results.every((r) => r.status === 'accepted')).toBe(true);
    }
    // What the tablet itself worked out, tap by tap, with the same engine.
    let expected = basketball.newGame(engineRulesOf(seasonRulesPreset('high-school')), 0);
    for (const c of queue) {
      if (c.input.type === 'rules') continue;
      expected = basketball.apply(expected, c.input, { id: c.commandId, now: c.at });
    }
    const saved = t.db.state.states[0];
    expect(saved?.seq).toBe(300);
    expect(saved?.state).toEqual(expected);
    const players = basketball.derive(expected).players;
    expect(t.db.state.liveLines).toHaveLength(Object.keys(players).length);
    for (const line of t.db.state.liveLines) {
      const p = players[line.personId];
      expect(line.stats).toEqual({
        points: p?.points,
        fg1: p?.fg1,
        fg2: p?.fg2,
        fg3: p?.fg3,
        fouls: p?.fouls,
        turnovers: p?.turnovers,
      });
      expect(line.secondsPlayed).toBe(Math.floor((p?.ms ?? 0) / 1000));
    }
    const score = basketball.derive(expected).teams;
    expect(t.db.state.games[0]).toMatchObject({
      status: 'live',
      homeScore: score.home.score,
      awayScore: score.away.score,
    });
    // Minutes come from when each tap happened, not from when it arrived.
    expect(Math.max(...t.db.state.liveLines.map((l) => l.secondsPlayed ?? 0))).toBeLessThan(600);

    // The same queue again, from a saved copy on another device (T-129): all duplicates.
    const before = structuredClone(t.db.state);
    for (let i = 0; i < queue.length; i += maxCommandsPerBatch) {
      const result = await applyTrackerCommands(
        t.as(scorekeeperId),
        batchOf(queue.slice(i, i + maxCommandsPerBatch)),
        t.deps,
      );
      expect(result.ok && result.value.results.every((r) => r.status === 'duplicate')).toBe(true);
    }
    expect(t.db.state).toEqual(before);
  });
});

describe('forty games at once (T-112)', () => {
  const games = Array.from({ length: 40 }, (_, i) => game(i + 1, { captureMode: 'live' }));
  const sessions = games.map((g, i) => holdingSession({ id: sessionUuid(i + 1), gameId: g.id }));
  const batchFor = (n: number, first = 1) => ({
    gameId: gameUuid(n),
    protocolVersion: 1,
    sessionId: sessionUuid(n),
    commands: taps(tipOff, first + n * 1000),
  });

  it('batches for forty different games all hold their game at the same moment', async () => {
    let arrived = 0;
    let release = () => {};
    const all = new Promise<void>((resolve) => (release = resolve));
    const t = lockingTracker(
      { games, sessions, grants: [scorekeeperGrant], players: roster },
      async () => {
        // Each waits, holding its game, until all forty hold theirs. A lock shared
        // between games would leave the first holding it and the rest waiting forever.
        arrived += 1;
        if (arrived === games.length) release();
        await Promise.race([
          all,
          new Promise((_, reject) => setTimeout(() => reject(new Error('a game waited')), 2000)),
        ]);
      },
    );
    const results = await Promise.all(
      games.map((_, i) => applyTrackerCommands(t.as(scorekeeperId), batchFor(i + 1), t.deps)),
    );
    expect(
      results.every((r) => r.ok && r.value.results.every((x) => x.status === 'accepted')),
    ).toBe(true);
    expect(t.counts.mostHeld).toBe(40);
    expect(t.db.state.events).toHaveLength(40 * 3);
  });

  it('two batches for one game go one after the other', async () => {
    const order: string[] = [];
    const t = lockingTracker(
      {
        games: games.slice(0, 1),
        sessions: sessions.slice(0, 1),
        grants: [scorekeeperGrant],
        players: roster,
      },
      async () => {
        order.push('locked');
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push('working');
      },
    );
    const [a, b] = await Promise.all([
      applyTrackerCommands(t.as(scorekeeperId), batchFor(1), t.deps),
      applyTrackerCommands(
        t.as(scorekeeperId),
        {
          ...batchFor(1),
          commands: taps(
            [{ type: 'score', side: 'home', playerId: homeIds[0] ?? '', points: 2 }],
            9000,
          ),
        },
        t.deps,
      ),
    ]);
    expect(order).toEqual(['locked', 'working', 'locked', 'working']);
    expect(t.counts.mostHeld).toBe(1);
    expect([statuses(a), statuses(b)]).toEqual([
      ['accepted', 'accepted', 'accepted'],
      ['accepted'],
    ]);
    expect(t.db.state.events.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
  });
});

describe('a takeover and a batch at the same moment (T-111, T-116)', () => {
  it('a takeover holding the game makes a batch from the old session wait, then refuses it', async () => {
    let locks = 0;
    let takeoverHolds = () => {};
    const holding = new Promise<void>((resolve) => (takeoverHolds = resolve));
    let letGo = () => {};
    const gate = new Promise<void>((resolve) => (letGo = resolve));
    const t = lockingTracker(
      {
        games: [game(1, { captureMode: 'live' })],
        sessions: [holdingSession()],
        grants: [scorekeeperGrant, { ...scorekeeperGrant, id: 'g2', accountId: editorId }],
        players: roster,
      },
      async () => {
        locks += 1;
        // The first to lock is the takeover: it waits there until the batch is queued.
        if (locks === 1) {
          takeoverHolds();
          await gate;
        }
      },
    );
    const takeover = takeOverScoring(
      t.as(editorId),
      { gameId, deviceId: 'phone', confirmed: true, expectedHolderSince: startOfTest },
      t.deps,
    );
    await holding;
    const late = applyTrackerCommands(t.as(scorekeeperId), batchOf(taps(tipOff)), t.deps);
    // Give the batch every chance to run: it must still be waiting for the game.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(t.db.state.events).toEqual([]);
    letGo();
    expect(await takeover).toMatchObject({ value: { status: 'held-by-you' } });
    expect(statuses(await late)).toEqual(['refused', 'refused', 'refused']);
    expect(t.counts.mostHeld).toBe(1);
    expect(t.db.state.events).toEqual([]);
  });

  it('a batch holding the game finishes before a takeover touches the session', async () => {
    let locks = 0;
    let batchHolds = () => {};
    const holding = new Promise<void>((resolve) => (batchHolds = resolve));
    let letGo = () => {};
    const gate = new Promise<void>((resolve) => (letGo = resolve));
    const t = lockingTracker(
      {
        games: [game(1, { captureMode: 'live' })],
        sessions: [holdingSession()],
        grants: [scorekeeperGrant, { ...scorekeeperGrant, id: 'g2', accountId: editorId }],
        players: roster,
      },
      async () => {
        locks += 1;
        if (locks === 1) {
          batchHolds();
          await gate;
        }
      },
    );
    const batch = applyTrackerCommands(t.as(scorekeeperId), batchOf(taps(tipOff)), t.deps);
    await holding;
    const takeover = takeOverScoring(
      t.as(editorId),
      { gameId, deviceId: 'phone', confirmed: true, expectedHolderSince: startOfTest },
      t.deps,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(t.db.state.sessions.map((x) => x.accountId)).toEqual([scorekeeperId]);
    letGo();
    expect(statuses(await batch)).toEqual(['accepted', 'accepted', 'accepted']);
    expect(await takeover).toMatchObject({ value: { status: 'held-by-you' } });
    expect(t.db.state.sessions.map((x) => x.accountId)).toEqual([editorId]);
  });
});
