// What the format screens read of one game (step 2.119; S-35, S-39): the given, season's
// and applying formats, every rule for the start confirmation (the clock mode included),
// whether this person may change it now and why not, and the presets (checklist B2).
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
import { FORMAT_FACTS } from '@srleagues/contracts';
import { readGameFormat } from './read-game-format.ts';

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

const read = (t: Tracker, as: string, id = gameId) =>
  readGameFormat(t.as(as), { gameId: id }, t.deps);

describe("reading a game's format (step 2.119)", () => {
  it("says the season's format applies, lists every rule and offers the presets", async () => {
    const t = setUp();
    const view = await read(t, scorekeeperId);
    if (!view.ok) throw new Error(JSON.stringify(view));
    expect(view.value).toMatchObject({
      version: 1,
      given: null,
      season: formatOfRules(halves),
      applies: formatOfRules(halves),
      source: 'season',
      change: { may: true, as: 'scorekeeper' },
    });
    expect(view.value.facts.map((f) => f.fact)).toEqual([...FORMAT_FACTS]);
    expect(view.value.facts).toContainEqual({ fact: 'clockMode', value: 'running' });
    expect(view.value.presets.map((p) => p.preset)).toEqual([
      'high-school',
      'rec-league',
      'season',
    ]);
    expect(view.value.presets[0]?.format).toEqual(quarters);
  });

  it('shows the given format, then the fixed one once under way, and why it cannot change', async () => {
    const t = setUp();
    expect((await give(t, schedulerId)).ok).toBe(true);
    const given = await read(t, schedulerId);
    expect(given).toMatchObject({
      ok: true,
      value: {
        given: quarters,
        applies: quarters,
        source: 'given',
        change: { may: true, as: 'admin' },
      },
    });
    expect(given.ok && given.value.facts).toContainEqual({ fact: 'clockMode', value: 'stop' });
    // The season's other game still follows the season.
    expect(await read(t, schedulerId, otherGameId)).toMatchObject({
      ok: true,
      value: { given: null, source: 'season' },
    });
    await tap(t, [...lineups, { type: 'start' }]);
    expect(await read(t, scorekeeperId)).toMatchObject({
      ok: true,
      value: { applies: quarters, source: 'fixed', change: { may: false, reason: 'under-way' } },
    });
  });

  it('says the setting is off to a scorekeeper, and refuses someone without the permission', async () => {
    const t = setUp({ settings: settingOff });
    expect(await read(t, scorekeeperId)).toMatchObject({
      ok: true,
      value: { change: { may: false, reason: 'setting-off' } },
    });
    expect(await read(t, schedulerId)).toMatchObject({
      ok: true,
      value: { change: { may: true, as: 'admin' } },
    });
    expect(await read(t, strangerId)).toMatchObject({ ok: false, error: { code: 'not-allowed' } });
  });

  it('says a game that is over is finished, not under way, though no format was ever fixed', async () => {
    const t = setUp();
    // Decided by a final score: it never went live at the table, so nothing was fixed.
    const game = gameOf(t);
    if (game === undefined) throw new Error('no game');
    for (const status of ['final', 'forfeit']) {
      Object.assign(game, { status });
      for (const as of [schedulerId, scorekeeperId]) {
        expect(await read(t, as)).toMatchObject({
          ok: true,
          value: { source: 'season', change: { may: false, reason: 'finished' } },
        });
      }
    }
  });
});
