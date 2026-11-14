// The engine's state for the scorekeeper's device (record 049, T-253): what the next
// batch would start from, for whoever may score the game and nobody else. The same
// read against the real database is in packages/database (the two-league harness and
// the role matrix).
import { seasonRulesPreset, type TrackerCommand } from '@srleagues/contracts';
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
  ownerId,
  rules,
  scorekeeperGrant,
  scorekeeperId,
  seasonId,
} from '../memory-games.test-helper.ts';
import { sessionUuid, startOfTest } from '../memory-scoring.test-helper.ts';
import { memoryTracker } from '../memory-tracker.test-helper.ts';
import { leaseMs } from '../scoring-session.ts';
import { applyTrackerCommands } from './apply-tracker-commands.ts';
import { readTrackerState } from './read-tracker-state.ts';

const gameId = gameUuid(1);
const sessionId = sessionUuid(1);
const home = '01900000-0000-7000-8000-000000010001';
const away = '01900000-0000-7000-8000-000000020001';

function setUp() {
  return memoryTracker({
    status: 'live',
    seasons: [{ id: seasonId, programId: 'p1', rules: seasonRulesPreset('high-school') }],
    games: [game(1, { captureMode: 'live' }), game(2, { binned: true })],
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
    players: [
      { personId: home, teamId: homeTeamId, jerseyNumber: '4', onGameDay: true },
      { personId: away, teamId: awayTeamId, jerseyNumber: '5', onGameDay: true },
    ],
  });
}

const taps: TrackerCommand[] = [
  {
    commandId: '01900000-0000-7000-8000-0000c0000001',
    at: startOfTest,
    input: { type: 'lineup', side: 'home', playerIds: [home] },
  },
  {
    commandId: '01900000-0000-7000-8000-0000c0000002',
    at: startOfTest + 1000,
    input: { type: 'score', side: 'home', playerId: home, points: 2 },
  },
];

describe('reading the tracker’s state (T-113, T-253)', () => {
  it('gives a game not yet tapped as a new game under its season’s rules', async () => {
    const t = setUp();
    const result = await readTrackerState(t.as(scorekeeperId), { gameId }, t.deps);
    const engineRules = engineRulesOf(seasonRulesPreset('high-school'));
    expect(result).toEqual({
      ok: true,
      value: { sequence: 0, state: basketball.newGame(engineRules, 0) },
    });
  });

  it('gives the saved state and its sequence number once taps are in', async () => {
    const t = setUp();
    const batch = { gameId, protocolVersion: 1, sessionId, commands: taps };
    await applyTrackerCommands(t.as(scorekeeperId), batch, t.deps);
    const result = await readTrackerState(t.as(scorekeeperId), { gameId }, t.deps);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.value.sequence).toBe(2);
    expect(result.value.state).toEqual(t.db.state.states[0]?.state);
    expect(basketball.derive(result.value.state).teams.home.score).toBe(2);
    expect(result.value.state.recent).toEqual(taps.map((c) => c.commandId));
  });

  it('gives a state holding only line-ups the game’s rules as they stand (S-1)', async () => {
    const t = setUp();
    const batch = { gameId, protocolVersion: 1, sessionId, commands: taps.slice(0, 1) };
    await applyTrackerCommands(t.as(scorekeeperId), batch, t.deps);
    const halves = rules((r) => {
      r.gameFormat.periods = 2;
      r.gameFormat.periodSeconds = 1200;
    });
    t.db.state.seasons = [{ id: seasonId, programId: 'p1', rules: halves }];
    const result = await readTrackerState(t.as(scorekeeperId), { gameId }, t.deps);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.value.state.rules).toEqual(engineRulesOf(halves));
    expect(result.value.state.clock.remainingMs).toBe(1_200_000);
  });

  it('is only for whoever may score the game, and changes nothing', async () => {
    const t = setUp();
    const before = structuredClone(t.db.state);
    expect(await readTrackerState(t.as(editorId), { gameId }, t.deps)).toMatchObject({
      ok: false,
      error: { code: 'not-allowed' },
    });
    expect(await readTrackerState(t.as(null), { gameId }, t.deps)).toMatchObject({
      ok: false,
      error: { code: 'not-allowed' },
    });
    expect(t.db.state).toEqual(before);
  });

  it('finds no game that is missing or in the bin', async () => {
    const t = setUp();
    for (const id of [gameUuid(2), gameUuid(9)]) {
      expect(await readTrackerState(t.as(ownerId), { gameId: id }, t.deps)).toEqual({
        ok: false,
        error: { code: 'game-not-found' },
      });
    }
  });
});
