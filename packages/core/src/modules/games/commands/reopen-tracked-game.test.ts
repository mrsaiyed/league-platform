// The scorekeeper reopens a game they just ended (step 2.120, S-36, A-5): with a reason,
// for as long after the end as the league allows, measured on the server's clock; the
// game goes back to its tracker and the device that scored it carries on. The read the
// device makes before the tap is tested beside it (read-reopen-offer.test.ts). The same
// against the real database, with the standings both ways, is in packages/database
// (stores/scorekeeper-reopen-commands.test.ts).
import { describe, expect, it } from 'vitest';
import type { Grant } from '../../access/index.ts';
import {
  finalGame,
  game,
  gameUuid,
  leagueId,
  ownerId,
  programScorekeeperId,
  schedulerId,
  scorekeeperGrant,
  scorekeeperId,
  scoringRule,
  seasonId,
} from '../memory-games.test-helper.ts';
import {
  awayIds,
  endedOnTablet,
  gameId,
  homeIds,
  minutes,
  minutesSetting,
  offerTo,
  otherScorekeeperId,
  reason,
  reopenAs,
  requestUuid,
  sequenceOf,
  sessionId,
  setUp,
  tap,
  versionOf,
} from '../reopen-game.test-helper.ts';
import { leaseMs } from '../scoring-session.ts';
import { endTrackedGame } from './end-tracked-game.ts';
import { openScoringSession } from './open-scoring-session.ts';
import { reopenGame } from './reopen-game.ts';
import { reopenTrackedGame } from './reopen-tracked-game.ts';

describe('a scorekeeper reopening a game they ended (S-36)', () => {
  it('reopens at 29 minutes with a reason: live again, the correction says who and why', async () => {
    const t = setUp();
    const endedAt = await endedOnTablet(t);
    t.clock.at = endedAt + minutes(29);
    const before = t.db.state.games[0];
    // Ended in regulation: its result keeps 0 overtime periods (step 2.200).
    expect(before?.overtimePeriods).toBe(0);
    const requestId = requestUuid();
    const result = await reopenTrackedGame(
      t.as(scorekeeperId),
      { gameId, requestId, sequence: 7, reason },
      t.deps,
    );
    // The tablet is told the reopen's own number: the event after its End game.
    expect(result).toEqual({ ok: true, value: { sequence: 8 } });
    expect(t.db.state.events.at(-1)).toMatchObject({
      seq: 8,
      type: 'reopen',
      commandId: requestId,
    });
    const s = t.db.state;
    expect(s.games[0]).toMatchObject({
      status: 'live',
      homeScore: 5,
      awayScore: 2,
      finalizedAt: null,
      // Not final now: no overtime count until it ends again (step 2.200).
      overtimePeriods: null,
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

  it('counts exactly the minutes the league sets: 30 opens, a moment more does not', async () => {
    const t = setUp();
    const endedAt = await endedOnTablet(t);
    t.clock.at = endedAt + minutes(30);
    expect(await reopenAs(t, scorekeeperId)).toBe('ok');
    expect(await tap(t, [{ type: 'end' }])).toEqual(['accepted']);
    const second = t.db.state.games[0];
    if (second === undefined) throw new Error('no game');
    t.db.state.games[0] = { ...second, finalizedAt: new Date(t.clock.now()).toISOString() };
    t.clock.at += minutes(30) + 1;
    expect(await reopenAs(t, scorekeeperId)).toBe('reopen-time-over');
  });

  it("never counts the device's clock: a tablet two hours behind or ahead changes nothing", async () => {
    for (const deviceAhead of [-minutes(120), minutes(120)]) {
      const t = setUp();
      const endedAt = await endedOnTablet(t, deviceAhead);
      // The End tap carries the tablet's time (never later than the server's) ...
      const end = t.db.state.events.find((e) => e.type === 'end');
      expect(end?.tappedAt).toBe(Math.min(endedAt, endedAt + deviceAhead));
      // ... but the time allowed runs from when the server took it.
      t.clock.at = endedAt + minutes(29);
      expect((await offerTo(t, scorekeeperId)).reopen).toEqual({
        when: 'until',
        until: endedAt + minutes(30),
      });
      expect(await reopenAs(t, scorekeeperId), String(deviceAhead)).toBe('ok');
    }
    const late = setUp();
    const endedAt = await endedOnTablet(late, -minutes(120));
    late.clock.at = endedAt + minutes(31);
    expect(await reopenAs(late, scorekeeperId)).toBe('reopen-time-over');
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
      ],
    });
    await endedOnTablet(t);
    const code = async (n: number, sequence?: number) => {
      const result = await reopenTrackedGame(
        t.as(scorekeeperId),
        { gameId: gameUuid(n), requestId: requestUuid(), reason, sequence },
        t.deps,
      );
      return result.ok ? 'ok' : result.error.code;
    };
    // Entered as a final score (or a box score): no tracker state.
    expect(await code(2)).toBe('not-ended-by-tracker');
    expect(await code(3)).toBe('not-ended-by-tracker');
    expect(await code(4)).toBe('game-not-decided');
    expect(await code(9)).toBe('game-not-found');
    // The tablet knows an older number than the game's: it moved on since.
    expect(await code(1, sequenceOf(t) - 1)).toBe('changed-since-read');
    expect(await code(1, 0)).toBe('invalid-input');
    // The number is optional; the right one, or none, reopens it.
    expect(await code(1, sequenceOf(t))).toBe('ok');
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

  it('is safe to send twice: the same request id is answered "reopened" again, nothing twice', async () => {
    const t = setUp();
    const endedAt = await endedOnTablet(t);
    t.clock.at = endedAt + minutes(5);
    const requestId = requestUuid();
    const send = (accountId = scorekeeperId) =>
      reopenTrackedGame(t.as(accountId), { gameId, requestId, sequence: 7, reason }, t.deps);
    expect(await send()).toEqual({ ok: true, value: { sequence: 8 } });
    const once = structuredClone(t.db.state);
    // The answer was lost on the gym's Wi-Fi; the device sends the same request again.
    expect(await send()).toEqual({ ok: true, value: { sequence: 8 } });
    expect(t.db.state).toEqual(once);
    expect(t.db.state.corrections).toHaveLength(1);
    // Later taps have been saved since: still "reopened", with the game's number now.
    await tap(t, [{ type: 'score', side: 'away', playerId: awayIds[1] ?? '', points: 2 }]);
    t.clock.at = endedAt + minutes(45);
    expect(await send()).toEqual({ ok: true, value: { sequence: 9 } });
    // Another account sending that id, or an id a tap already used, is refused.
    expect(await send(ownerId)).toMatchObject({ ok: false, error: { code: 'changed-since-read' } });
    const tapId = t.db.state.events.find((e) => e.type === 'start')?.commandId ?? '';
    expect(await reopenAs(t, ownerId, { requestId: tapId })).toBe('changed-since-read');
  });

  it('refuses a late retry once the game has been ended again, and writes nothing', async () => {
    const t = setUp();
    const endedAt = await endedOnTablet(t);
    t.clock.at = endedAt + minutes(5);
    const requestId = requestUuid();
    const send = () =>
      reopenTrackedGame(t.as(scorekeeperId), { gameId, requestId, reason }, t.deps);
    // Reopened, but the answer was lost on the way.
    expect(await send()).toEqual({ ok: true, value: { sequence: 8 } });
    // The game is ended again before the retry arrives.
    expect(await tap(t, [{ type: 'end' }])).toEqual(['accepted']);
    const ended = structuredClone(t.db.state);
    expect(await send()).toEqual({ ok: false, error: { code: 'changed-since-read' } });
    expect(t.db.state).toEqual(ended);
    expect(t.db.state.games[0]?.status).toBe('final');
  });

  it('tells who ended the game when it was not this scorekeeper', async () => {
    const t = setUp();
    await endedOnTablet(t);
    const result = await reopenTrackedGame(
      t.as(otherScorekeeperId),
      { gameId, requestId: requestUuid(), reason },
      t.deps,
    );
    expect(result).toEqual({
      ok: false,
      error: { code: 'not-ended-by-you', endedBy: scorekeeperId },
    });
  });

  it('may correct games only in another program: then only as the one who ended it, in time', async () => {
    const adminElsewhere = (accountId: string, n: string): Grant => ({
      ...scorekeeperGrant,
      id: `01900000-0000-7000-8000-0000000000${n}`,
      accountId,
      role: 'admin',
      scope: { type: 'program', id: 'p2' },
    });
    const t = setUp();
    t.db.state.grants = [
      ...t.db.state.grants,
      adminElsewhere(scorekeeperId, 'd1'),
      adminElsewhere(otherScorekeeperId, 'd2'),
    ];
    const endedAt = await endedOnTablet(t);
    t.clock.at = endedAt + minutes(5);
    expect(await reopenAs(t, otherScorekeeperId)).toBe('not-ended-by-you');
    t.clock.at = endedAt + minutes(31);
    expect((await offerTo(t, scorekeeperId)).reopen).toEqual({
      when: 'no',
      code: 'reopen-time-over',
    });
    expect(await reopenAs(t, scorekeeperId)).toBe('reopen-time-over');
    t.clock.at = endedAt + minutes(29);
    expect(await reopenAs(t, scorekeeperId)).toBe('ok');
  });
});
