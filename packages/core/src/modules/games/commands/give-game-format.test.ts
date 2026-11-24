// Giving one game its own format (step 2.119; P7 §5.1, S-21, S-35): a scorekeeper turns a
// game of a halves season into quarters at the table and the clock, the periods and the
// bonus follow on the server while the season's other game is untouched; the league's
// setting off refuses the scorekeeper and still lets an admin; after the first play both
// are refused; a game given 8-minute quarters, started and marked not started still has
// them; someone without the permission is refused. The same against the real database,
// with the isolation case, is in packages/database (stores/game-format-commands.test.ts).
import {
  formatOfRules,
  seasonRulesPreset,
  type GameFormatRules,
  type TrackerCommand,
} from '@srleagues/contracts';
import type { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { engineRulesOf } from '../engine-rules.ts';
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
import { markNotStarted } from './mark-not-started.ts';

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

describe('giving one game its own format (step 2.119)', () => {
  it('turns halves into quarters at the table: the clock, periods and bonus follow on the server', async () => {
    const t = setUp();
    await tap(t, lineups);
    expect(stateOf(t).rules.periods).toBe(2);

    const given = await give(t, scorekeeperId);
    expect(given).toEqual({ ok: true, value: { version: 2 } });
    expect(t.db.state.givenFormats[gameId]).toEqual(quarters);
    expect(t.db.state.activity.at(-1)).toMatchObject({
      action: 'games.give_game_format',
      details: { as: 'scorekeeper', periods: 4, periodSeconds: 480, clockMode: 'stop' },
    });

    // The next taps take the given format, and the game fixes it when it goes live.
    await tap(t, [{ type: 'start' }]);
    const rules = stateOf(t).rules;
    expect(rules).toMatchObject({
      periods: 4,
      periodSeconds: 480,
      clockMode: 'stop',
      bonusFouls: 5,
    });
    expect(rules.doubleBonusFouls).toBeNull();
    expect(gameOf(t)?.format).toMatchObject({
      gameFormat: quarters.gameFormat,
      clock: quarters.clock,
      fouls: quarters.fouls,
      timeouts: quarters.timeouts,
      // The rest stays the season's.
      statistics: halves.statistics,
      allowTies: halves.allowTies,
    });
    // The season's other game is untouched.
    expect(gameOf(t, otherGameId)).toMatchObject({ format: null, version: 1 });
    expect(t.db.state.givenFormats[otherGameId]).toBeUndefined();
    expect(t.db.state.seasons[0]?.rules).toEqual(halves);
  });

  it('with the setting off refuses a scorekeeper and still lets an admin', async () => {
    const t = setUp({ settings: settingOff });
    expect(await give(t, scorekeeperId)).toEqual({ ok: false, error: { code: 'setting-off' } });
    expect(t.db.state.givenFormats[gameId]).toBeUndefined();
    expect(await give(t, schedulerId)).toEqual({ ok: true, value: { version: 2 } });
    expect(t.db.state.givenFormats[gameId]).toEqual(quarters);
  });

  it('refuses both, as finished, once the game is over', async () => {
    const t = setUp();
    const game = t.db.state.games.find((g) => g.id === gameId);
    if (game === undefined) throw new Error('no game');
    Object.assign(game, { status: 'final' });
    expect(await give(t, scorekeeperId)).toEqual({ ok: false, error: { code: 'finished' } });
    expect(await give(t, schedulerId)).toEqual({ ok: false, error: { code: 'finished' } });
    expect(t.db.state.givenFormats[gameId]).toBeUndefined();
  });

  it('refuses both once the game is under way', async () => {
    const t = setUp();
    await tap(t, [...lineups, { type: 'start' }]);
    expect(await give(t, scorekeeperId)).toEqual({ ok: false, error: { code: 'under-way' } });
    expect(await give(t, schedulerId)).toEqual({ ok: false, error: { code: 'under-way' } });
  });

  it('keeps 8-minute quarters through a start and a mark not started', async () => {
    const t = setUp();
    expect((await give(t, schedulerId)).ok).toBe(true);
    await tap(t, [...lineups, { type: 'start' }]);
    expect(stateOf(t).rules).toMatchObject({ periods: 4, periodSeconds: 480 });
    const sequence = t.db.state.states.find((s) => s.gameId === gameId)?.seq ?? 0;
    const marked = await markNotStarted(t.as(scorekeeperId), { gameId, sequence }, t.deps);
    expect(marked.ok).toBe(true);
    expect(gameOf(t)).toMatchObject({ status: 'scheduled', format: null });
    expect(t.db.state.givenFormats[gameId]).toEqual(quarters);
    // The cleared state has the quarters, not the season's halves.
    expect(stateOf(t).rules).toEqual(engineRulesOf({ ...halves, ...withoutVersion(quarters) }));
    // The session ended with the marking; the next start begins from this state.
  });

  it('refuses someone without the permission, a stale form and a game that is not there', async () => {
    const t = setUp();
    expect(await give(t, strangerId)).toMatchObject({ ok: false, error: { code: 'not-allowed' } });
    const stale = await giveGameFormat(
      t.as(schedulerId),
      { gameId, version: 7, format: quarters },
      t.deps,
    );
    expect(stale).toEqual({ ok: false, error: { code: 'changed-since-read' } });
    const missing = await giveGameFormat(
      t.as(schedulerId),
      { gameId: gameUuid(9), version: 1, format: quarters },
      t.deps,
    );
    expect(missing).toEqual({ ok: false, error: { code: 'game-not-found' } });
    expect(t.db.state.givenFormats).toEqual({});
  });

  it('refuses a format that does not hold together', async () => {
    const t = setUp();
    const wrong = { ...quarters, clock: { ...quarters.clock, stopClockLastSeconds: 60 } };
    const result = await give(t, schedulerId, wrong);
    expect(result.ok).toBe(false);
    expect(t.db.state.givenFormats).toEqual({});
  });
});

function withoutVersion(format: GameFormatRules) {
  const { version: _version, ...parts } = format;
  return parts;
}
