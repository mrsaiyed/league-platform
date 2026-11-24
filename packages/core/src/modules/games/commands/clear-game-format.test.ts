// Taking back the format a game was given (step 2.119): the game follows its season's
// rules again, by the same people at the same times as giving one.
import {
  formatOfRules,
  seasonRulesPreset,
  type GameFormatRules,
  type TrackerCommand,
} from '@srleagues/contracts';
import type { basketball } from '@srleagues/sports';
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
import { giveGameFormat } from './give-game-format.ts';
import { clearGameFormat } from './clear-game-format.ts';

const gameId = gameUuid(1);
const otherGameId = gameUuid(2);
const sessionId = sessionUuid(1);
const strangerId = '01900000-0000-7000-8000-0000000000f9';
const person = (side: number, n: number) =>
  `01900000-0000-7000-8000-0000000${side}${String(n).padStart(4, '0')}`;
const homeIds = [1, 2, 3, 4, 5].map((n) => person(1, n));
const awayIds = [1, 2, 3, 4, 5].map((n) => person(2, n));
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

/** The high-school preset's format: 8-minute quarters, a stop clock, the bonus on the 5th. */
const quarters: GameFormatRules = formatOfRules(seasonRulesPreset('high-school'));
const halves = seasonRulesPreset('rec-league');

/** A halves season with two games, the first held by the scorekeeper's tablet. */
function setUp(state: Partial<MemoryTracker> = {}) {
  return memoryTracker({
    seasons: [{ id: seasonId, programId: 'p1', rules: halves }],
    games: [game(1, { captureMode: 'live' }), game(2, { captureMode: 'live' })],
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

const settingOff = {
  'games.scorekeepersMayChangeFormat': [
    { level: 'league' as const, document: { version: 1, value: false } },
  ],
};

let next = 1;
async function tap(t: Tracker, inputs: readonly TrackerCommand['input'][]) {
  const commands = inputs.map((input) => {
    next += 1;
    const commandId = `01900000-0000-7000-8000-0000c0${String(next).padStart(6, '0')}`;
    return { commandId, at: t.clock.now(), input };
  });
  const result = await applyTrackerCommands(
    t.as(scorekeeperId),
    { gameId, protocolVersion: 1, sessionId, commands },
    t.deps,
  );
  if (!result.ok || result.value.results.some((r) => r.status !== 'accepted')) {
    throw new Error(`taps not taken: ${JSON.stringify(result)}`);
  }
}
const lineups: TrackerCommand['input'][] = [
  { type: 'lineup', side: 'home', playerIds: homeIds },
  { type: 'lineup', side: 'away', playerIds: awayIds },
];

const gameOf = (t: Tracker, id = gameId) => t.db.state.games.find((g) => g.id === id);
const versionOf = (t: Tracker, id = gameId) => gameOf(t, id)?.version ?? 0;
const stateOf = (t: Tracker) =>
  t.db.state.states.find((s) => s.gameId === gameId)?.state as basketball.GameState;
const give = (t: Tracker, as: string, format = quarters, id = gameId) =>
  giveGameFormat(t.as(as), { gameId: id, version: versionOf(t, id), format }, t.deps);

const clear = (t: Tracker, as: string) =>
  clearGameFormat(t.as(as), { gameId, version: versionOf(t) }, t.deps);

describe('taking back the format a game was given (step 2.119)', () => {
  it("puts the game back on its season's format, and its taps follow", async () => {
    const t = setUp();
    await tap(t, lineups);
    expect((await give(t, scorekeeperId)).ok).toBe(true);
    expect(await clear(t, scorekeeperId)).toEqual({ ok: true, value: { version: 3 } });
    expect(t.db.state.givenFormats[gameId]).toBeNull();
    expect(t.db.state.activity.at(-1)).toMatchObject({ action: 'games.clear_game_format' });
    await tap(t, [{ type: 'start' }]);
    expect((stateOf(t) as basketball.GameState).rules).toMatchObject({
      periods: 2,
      periodSeconds: 1200,
    });
    expect(gameOf(t)?.format).toEqual(halves);
  });

  it('follows the same rule as giving one: setting off, under way, no permission', async () => {
    const t = setUp({ settings: settingOff });
    expect((await give(t, schedulerId)).ok).toBe(true);
    expect(await clear(t, scorekeeperId)).toEqual({ ok: false, error: { code: 'setting-off' } });
    expect(await clear(t, strangerId)).toMatchObject({ ok: false, error: { code: 'not-allowed' } });
    await tap(t, [...lineups, { type: 'start' }]);
    expect(await clear(t, schedulerId)).toEqual({ ok: false, error: { code: 'under-way' } });
    expect(t.db.state.givenFormats[gameId]).toEqual(quarters);
  });
});
