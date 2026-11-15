// What the tests of the scorekeeper's reopen share (step 2.120, S-36): a league with one
// live-tracked game held by the scorekeeper's tablet, taps from that tablet, a game
// scored and ended on it, and the reopen and the read before it, over core's memory
// stores. Used by commands/reopen-tracked-game.test.ts and commands/read-reopen-offer.test.ts.
import { seasonRulesPreset, type TrackerCommand } from '@srleagues/contracts';
import { expect } from 'vitest';
import type { Grant } from '../access/index.ts';
import { applyTrackerCommands } from './commands/apply-tracker-commands.ts';
import { readReopenOffer } from './commands/read-reopen-offer.ts';
import { reopenTrackedGame } from './commands/reopen-tracked-game.ts';
import {
  awayTeamId,
  game,
  gameUuid,
  homeTeamId,
  programScorekeeperGrant,
  schedulerGrant,
  scorekeeperGrant,
  scorekeeperId,
  seasonId,
} from './memory-games.test-helper.ts';
import { sessionUuid, startOfTest } from './memory-scoring.test-helper.ts';
import { memoryTracker, type MemoryTracker } from './memory-tracker.test-helper.ts';
import type { GamePlayer } from './ports.ts';
import { leaseMs } from './scoring-session.ts';

export const gameId = gameUuid(1);
export const sessionId = sessionUuid(1);
export const homeIds = [1, 2, 3, 4, 5].map(
  (n) => `01900000-0000-7000-8000-00000001${String(n).padStart(4, '0')}`,
);
export const awayIds = [1, 2, 3, 4, 5].map(
  (n) => `01900000-0000-7000-8000-00000002${String(n).padStart(4, '0')}`,
);
const commandUuid = (n: number) => `01900000-0000-7000-8000-0000c0${String(n).padStart(6, '0')}`;
export const minutes = (n: number) => n * 60_000;
export const reason = ' Tapped End game instead of Pause ';

/** A second scorekeeper of the whole league, who did not end the game. */
export const otherScorekeeperId = '01900000-0000-7000-8000-0000000000a5';
const otherScorekeeperGrant: Grant = {
  ...scorekeeperGrant,
  id: '01900000-0000-7000-8000-0000000000f6',
  accountId: otherScorekeeperId,
};

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

/** A live-tracked game held by the scorekeeper's tablet. */
export function setUp(state: Partial<MemoryTracker> = {}) {
  return memoryTracker({
    seasons: [{ id: seasonId, programId: 'p1', rules: seasonRulesPreset('high-school') }],
    games: [game(1, { captureMode: 'live' })],
    grants: [scorekeeperGrant, otherScorekeeperGrant, schedulerGrant, programScorekeeperGrant],
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

export type Tracker = ReturnType<typeof setUp>;
type Input = TrackerCommand['input'];

let numbered = 0;
/**
 * Sends taps from the tablet; their statuses. `deviceAhead` is how far the tablet's own
 * clock is ahead of the server's (behind when negative): the time each tap carries.
 */
export async function tap(t: Tracker, inputs: readonly Input[], deviceAhead = 0) {
  const commands = inputs.map((input) => {
    numbered += 1;
    return { commandId: commandUuid(numbered), at: t.clock.now() + deviceAhead, input };
  });
  const result = await applyTrackerCommands(
    t.as(scorekeeperId),
    { gameId, protocolVersion: 1, sessionId, commands },
    t.deps,
  );
  if (!result.ok) throw new Error(`batch refused: ${result.error.code}`);
  return result.value.results.map((r) => r.status);
}

/**
 * Home 5, away 2, then End game tapped on the tablet. The game's end is stamped by
 * the database's own clock; the stand-in stamps a fixed time, so it is set here to the
 * moment the server took the end, as the database would.
 */
export async function endedOnTablet(t: Tracker, deviceAhead = 0) {
  await tap(
    t,
    [
      { type: 'lineup', side: 'home', playerIds: homeIds },
      { type: 'lineup', side: 'away', playerIds: awayIds },
      { type: 'start' },
      { type: 'score', side: 'home', playerId: homeIds[0] ?? '', points: 3 },
      { type: 'score', side: 'home', playerId: homeIds[1] ?? '', points: 2 },
      { type: 'score', side: 'away', playerId: awayIds[0] ?? '', points: 2 },
    ],
    deviceAhead,
  );
  t.clock.advance(1800);
  expect(await tap(t, [{ type: 'end' }], deviceAhead)).toEqual(['accepted']);
  const [ended] = t.db.state.games;
  if (ended === undefined) throw new Error('no game');
  t.db.state.games[0] = { ...ended, finalizedAt: new Date(t.clock.now()).toISOString() };
  return t.clock.now();
}

export const versionOf = (t: Tracker) => t.db.state.games[0]?.version ?? 0;
/** The number of the last tap saved: what the tablet knows of the game. */
export const sequenceOf = (t: Tracker, id = gameId) =>
  t.db.state.states.find((x) => x.gameId === id)?.seq ?? 0;

let requests = 0;
/** A fresh id for one reopen, as the device makes it. */
export const requestUuid = () => {
  requests += 1;
  return `01900000-0000-7000-8000-0000e0${String(requests).padStart(6, '0')}`;
};

/** Reopens with a fresh request id and no sequence number, unless `extra` gives them. */
export async function reopenAs(t: Tracker, accountId: string | null, extra: object = {}) {
  const result = await reopenTrackedGame(
    t.as(accountId),
    { gameId, requestId: requestUuid(), reason, ...extra },
    t.deps,
  );
  return result.ok ? 'ok' : result.error.code;
}

/** What the device is told before the tap. */
export const offerTo = async (t: Tracker, accountId: string) => {
  const result = await readReopenOffer(t.as(accountId), { gameId }, t.deps);
  if (!result.ok) throw new Error(`offer refused: ${result.error.code}`);
  return result.value;
};

/** The league's own minutes, as setting_values keeps them. */
export const minutesSetting = (value: number) => ({
  'games.scorekeeperReopenMinutes': [{ level: 'league' as const, document: { version: 1, value } }],
});
