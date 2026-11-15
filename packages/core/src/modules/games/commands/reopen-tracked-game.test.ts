// The scorekeeper reopens a game they just ended (step 2.120, S-36, A-5): with a reason,
// for as long after the end as the league allows, measured on the server's clock; the
// game goes back to its tracker and the device that scored it carries on. The same
// against the real database, with the standings both ways, is in packages/database
// (stores/scorekeeper-reopen-commands.test.ts).
import { seasonRulesPreset, type TrackerCommand } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import type { Grant } from '../../access/index.ts';
import {
  awayTeamId,
  finalGame,
  game,
  gameUuid,
  homeTeamId,
  leagueId,
  ownerId,
  programScorekeeperGrant,
  programScorekeeperId,
  schedulerGrant,
  schedulerId,
  scorekeeperGrant,
  scorekeeperId,
  scoringRule,
  seasonId,
} from '../memory-games.test-helper.ts';
import { sessionUuid, startOfTest } from '../memory-scoring.test-helper.ts';
import { memoryTracker, type MemoryTracker } from '../memory-tracker.test-helper.ts';
import type { GamePlayer } from '../ports.ts';
import { leaseMs } from '../scoring-session.ts';
import { applyTrackerCommands } from './apply-tracker-commands.ts';
import { endTrackedGame } from './end-tracked-game.ts';
import { openScoringSession } from './open-scoring-session.ts';
import { reopenGame } from './reopen-game.ts';
import { reopenTrackedGame } from './reopen-tracked-game.ts';

const gameId = gameUuid(1);
const sessionId = sessionUuid(1);
const homeIds = [1, 2, 3, 4, 5].map(
  (n) => `01900000-0000-7000-8000-00000001${String(n).padStart(4, '0')}`,
);
const awayIds = [1, 2, 3, 4, 5].map(
  (n) => `01900000-0000-7000-8000-00000002${String(n).padStart(4, '0')}`,
);
const commandUuid = (n: number) => `01900000-0000-7000-8000-0000c0${String(n).padStart(6, '0')}`;
const minutes = (n: number) => n * 60_000;
const reason = ' Tapped End game instead of Pause ';

/** A second scorekeeper of the whole league, who did not end the game. */
const otherScorekeeperId = '01900000-0000-7000-8000-0000000000a5';
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
function setUp(state: Partial<MemoryTracker> = {}) {
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

type Tracker = ReturnType<typeof setUp>;
type Input = TrackerCommand['input'];

let numbered = 0;
/** Sends taps from the tablet; their statuses. */
async function tap(t: Tracker, inputs: readonly Input[]) {
  const commands = inputs.map((input) => {
    numbered += 1;
    return { commandId: commandUuid(numbered), at: t.clock.now(), input };
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
async function endedOnTablet(t: Tracker) {
  await tap(t, [
    { type: 'lineup', side: 'home', playerIds: homeIds },
    { type: 'lineup', side: 'away', playerIds: awayIds },
    { type: 'start' },
    { type: 'score', side: 'home', playerId: homeIds[0] ?? '', points: 3 },
    { type: 'score', side: 'home', playerId: homeIds[1] ?? '', points: 2 },
    { type: 'score', side: 'away', playerId: awayIds[0] ?? '', points: 2 },
  ]);
  t.clock.advance(1800);
  expect(await tap(t, [{ type: 'end' }])).toEqual(['accepted']);
  const [ended] = t.db.state.games;
  if (ended === undefined) throw new Error('no game');
  t.db.state.games[0] = { ...ended, finalizedAt: new Date(t.clock.now()).toISOString() };
  return t.clock.now();
}

const versionOf = (t: Tracker) => t.db.state.games[0]?.version ?? 0;

async function reopenAs(t: Tracker, accountId: string | null, extra: object = {}) {
  const result = await reopenTrackedGame(
    t.as(accountId),
    { gameId, version: versionOf(t), reason, ...extra },
    t.deps,
  );
  return result.ok ? 'ok' : result.error.code;
}

const minutesSetting = (value: number) => ({
  'games.scorekeeperReopenMinutes': [{ level: 'league' as const, document: { version: 1, value } }],
});

describe('a scorekeeper reopening a game they ended (S-36)', () => {
  it('reopens at 29 minutes with a reason: live again, the correction says who and why', async () => {
    const t = setUp();
    const endedAt = await endedOnTablet(t);
    t.clock.at = endedAt + minutes(29);
    const before = t.db.state.games[0];
    expect(await reopenAs(t, scorekeeperId)).toBe('ok');
    const s = t.db.state;
    expect(s.games[0]).toMatchObject({
      status: 'live',
      homeScore: 5,
      awayScore: 2,
      finalizedAt: null,
      version: (before?.version ?? 0) + 1,
    });
    expect(s.corrections).toEqual([
      {
        gameId,
        accountId: scorekeeperId,
        reason: 'Tapped End game instead of Pause',
        before: { version: 1, status: 'final', homeScore: 5, awayScore: 2 },
        after: { version: 1, status: 'live', homeScore: 5, awayScore: 2 },
      },
    ]);
    // The engine's reopen is in the event log, sent by the scorekeeper, at the server's time.
    expect(s.events.slice(-2).map((e) => e.type)).toEqual(['end', 'reopen']);
    expect(s.events.at(-1)).toMatchObject({ accountId: scorekeeperId, tappedAt: t.clock.now() });
    expect(s.states[0]).toMatchObject({ state: { status: 'live' } });
    // The did-not-play lines are gone until it ends again.
    expect(s.liveLines.every((l) => l.played)).toBe(true);
    expect(s.activity.map((a) => a.action)).toEqual([
      'games.end_tracked_game',
      'games.reopen_tracked_game',
    ]);
    expect(t.events).toEqual([
      { type: 'games.finalized', leagueId, gameId, seasonId },
      { type: 'games.reopened', leagueId, gameId, seasonId },
    ]);
  });

  it('is refused at 31 minutes under a 30-minute setting, saying an admin can reopen it', async () => {
    const t = setUp();
    const endedAt = await endedOnTablet(t);
    t.clock.at = endedAt + minutes(31);
    const before = structuredClone(t.db.state);
    expect(await reopenAs(t, scorekeeperId)).toBe('reopen-time-over');
    expect(t.db.state).toEqual(before);
    // An admin still can, at any time, through either door.
    expect(await reopenAs(t, ownerId)).toBe('ok');
  });

  it('counts exactly the minutes the league sets, never the device: 30 opens, a minute more does not', async () => {
    const t = setUp();
    const endedAt = await endedOnTablet(t);
    t.clock.at = endedAt + minutes(30);
    expect(await reopenAs(t, scorekeeperId)).toBe('ok');
    // Ended again with the same tablet; its taps carry the device's time, which counts for nothing.
    expect(await tap(t, [{ type: 'end' }])).toEqual(['accepted']);
    const second = t.db.state.games[0];
    if (second === undefined) throw new Error('no game');
    t.db.state.games[0] = { ...second, finalizedAt: new Date(t.clock.now()).toISOString() };
    t.clock.at += minutes(30) + 1;
    expect(await reopenAs(t, scorekeeperId)).toBe('reopen-time-over');
  });

  it("follows the league's setting: 10 minutes, and 0 for never", async () => {
    const ten = setUp({ settings: minutesSetting(10) });
    const endedAt = await endedOnTablet(ten);
    ten.clock.at = endedAt + minutes(11);
    expect(await reopenAs(ten, scorekeeperId)).toBe('reopen-time-over');
    ten.clock.at = endedAt + minutes(9);
    expect(await reopenAs(ten, scorekeeperId)).toBe('ok');

    const never = setUp({ settings: minutesSetting(0) });
    const ended = await endedOnTablet(never);
    never.clock.at = ended;
    expect(await reopenAs(never, scorekeeperId)).toBe('scorekeepers-may-not-reopen');
    expect(await reopenAs(never, schedulerId)).toBe('ok');
  });

  it('needs a reason, as for an admin (S-7)', async () => {
    const t = setUp();
    await endedOnTablet(t);
    const before = structuredClone(t.db.state);
    for (const missing of [undefined, '', '   ', 'x'.repeat(1001)]) {
      expect(await reopenAs(t, scorekeeperId, { reason: missing })).toBe('invalid-input');
    }
    expect(t.db.state).toEqual(before);
  });

  it('is refused to a scorekeeper who may not score that game, and changes nothing', async () => {
    const t = setUp();
    await endedOnTablet(t);
    const before = structuredClone(t.db.state);
    // Limited to another program; no role at all; no account.
    expect(await reopenAs(t, programScorekeeperId)).toBe('not-allowed');
    expect(await reopenAs(t, '01900000-0000-7000-8000-0000000000b9')).toBe('not-allowed');
    expect(await reopenAs(t, null)).toBe('not-allowed');
    // The role taken away a moment ago (read fresh, T-75).
    t.db.state.grants = t.db.state.grants.map((g) =>
      g.accountId === scorekeeperId ? { ...g, revokedAt: '2026-12-06T18:30:00.000Z' } : g,
    );
    expect(await reopenAs(t, scorekeeperId)).toBe('not-allowed');
    t.db.state.grants = before.grants;
    // Assigned games only, and this one is not theirs.
    t.db.state.settings = scoringRule('assignedOnly');
    expect(await reopenAs(t, scorekeeperId)).toBe('not-allowed');
    t.db.state.settings = {};
    // An archived or suspended league (U-9).
    for (const status of ['archived', 'suspended']) {
      t.db.state.status = status;
      expect(await reopenAs(t, scorekeeperId), status).toBe('not-allowed');
      expect(await reopenAs(t, ownerId), status).toBe('not-allowed');
    }
    t.db.state.status = before.status;
    expect(t.db.state).toEqual(before);
  });

  it('is only for the scorekeeper who ended it; someone who may correct games may always', async () => {
    const t = setUp();
    const endedAt = await endedOnTablet(t);
    t.clock.at = endedAt + minutes(5);
    expect(await reopenAs(t, otherScorekeeperId)).toBe('not-ended-by-you');
    t.clock.at = endedAt + minutes(180);
    expect(await reopenAs(t, schedulerId)).toBe('ok');
    expect(t.db.state.corrections.map((c) => c.accountId)).toEqual([schedulerId]);
  });

  it('a game ended by another account through end_tracked_game is not this scorekeeper’s to reopen', async () => {
    const t = setUp();
    await tap(t, [
      { type: 'lineup', side: 'home', playerIds: homeIds },
      { type: 'lineup', side: 'away', playerIds: awayIds },
      { type: 'start' },
      { type: 'score', side: 'home', playerId: homeIds[0] ?? '', points: 2 },
    ]);
    t.clock.advance(leaseMs / 1000);
    const ended = await endTrackedGame(t.as(ownerId), { gameId, version: versionOf(t) }, t.deps);
    expect(ended.ok).toBe(true);
    expect(await reopenAs(t, scorekeeperId)).toBe('not-ended-by-you');
  });

  it('answers for a game not ended by its tracker, not decided, moved on or missing', async () => {
    const t = setUp({
      games: [
        game(1, { captureMode: 'live' }),
        finalGame(2),
        finalGame(3, { status: 'forfeit', captureMode: 'live' }),
        game(4, { status: 'live', captureMode: 'live' }),
        finalGame(5, { version: 4 }),
      ],
    });
    await endedOnTablet(t);
    const code = async (n: number, version = 1) => {
      const result = await reopenTrackedGame(
        t.as(scorekeeperId),
        { gameId: gameUuid(n), version, reason },
        t.deps,
      );
      return result.ok ? 'ok' : result.error.code;
    };
    // Entered as a final score (or a box score): no tracker state.
    expect(await code(2)).toBe('not-ended-by-tracker');
    expect(await code(3)).toBe('not-ended-by-tracker');
    expect(await code(4)).toBe('game-not-decided');
    expect(await code(5)).toBe('changed-since-read');
    expect(await code(9)).toBe('game-not-found');
    // Decided by hand while its tracker was live: the state never ended.
    const live = setUp();
    await tap(live, [
      { type: 'lineup', side: 'home', playerIds: homeIds },
      { type: 'lineup', side: 'away', playerIds: awayIds },
      { type: 'start' },
      { type: 'score', side: 'home', playerId: homeIds[0] ?? '', points: 2 },
    ]);
    const [g] = live.db.state.games;
    if (g === undefined) throw new Error('no game');
    live.db.state.games[0] = { ...g, status: 'final', homeScore: 2, awayScore: 0 };
    expect(await reopenAs(live, scorekeeperId)).toBe('not-ended-by-tracker');
  });

  it('leaves the admin door as it was: a scorekeeper is still refused there', async () => {
    const t = setUp();
    await endedOnTablet(t);
    const result = await reopenGame(
      t.as(scorekeeperId),
      { gameId, version: versionOf(t), reason },
      t.deps,
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'not-allowed' } });
  });

  it('hands the game back to the tablet that scored it: it opens again and carries on', async () => {
    const t = setUp();
    const endedAt = await endedOnTablet(t);
    t.clock.at = endedAt + minutes(10);
    expect(await reopenAs(t, scorekeeperId)).toBe('ok');
    const opened = await openScoringSession(
      t.as(scorekeeperId),
      { gameId, deviceId: 'tablet' },
      t.deps,
    );
    expect(opened).toMatchObject({ ok: true, value: { status: 'held-by-you', sessionId } });
    expect(
      await tap(t, [
        { type: 'score', side: 'away', playerId: awayIds[1] ?? '', points: 2 },
        { type: 'score', side: 'home', playerId: homeIds[2] ?? '', points: 2 },
        { type: 'end' },
      ]),
    ).toEqual(['accepted', 'accepted', 'accepted']);
    expect(t.db.state.games[0]).toMatchObject({ status: 'final', homeScore: 7, awayScore: 4 });
  });
});
