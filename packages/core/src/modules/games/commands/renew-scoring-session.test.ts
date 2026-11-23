import { describe, expect, it } from 'vitest';
import type { Grant } from '../../access/index.ts';
import {
  game,
  gameUuid,
  schedulerGrant,
  schedulerId,
  scorekeeperGrant,
  scorekeeperId,
} from '../memory-games.test-helper.ts';
import { memoryScoring, sessionUuid, startOfTest } from '../memory-scoring.test-helper.ts';
import { holdSpareMs, leaseMs } from '../scoring-session.ts';
import { openScoringSession } from './open-scoring-session.ts';
import { releaseScoringSession } from './release-scoring-session.ts';
import { renewScoringSession } from './renew-scoring-session.ts';
import { takeOverScoring } from './take-over-scoring.ts';

const grants = [scorekeeperGrant, schedulerGrant];
const tablet = { gameId: gameUuid(1), deviceId: 'tablet' };
const own = { gameId: gameUuid(1), sessionId: sessionUuid(1) };

async function heldByTablet(state: { grants?: Grant[] } = {}, onExtend?: () => void) {
  const league = memoryScoring(
    { games: [game(1)], grants, ...state },
    onExtend === undefined ? {} : { onExtend },
  );
  await openScoringSession(league.as(scorekeeperId), tablet, league.deps);
  return league;
}

describe('renewScoringSession (T-116)', () => {
  it('runs the lease on for two minutes from now once less than half of it is left', async () => {
    const { db, deps, as, clock } = await heldByTablet();
    clock.advance(70);
    const now = startOfTest + 70_000;
    expect(await renewScoringSession(as(scorekeeperId), own, deps)).toEqual({
      ok: true,
      value: {
        status: 'held-by-you',
        sessionId: sessionUuid(1),
        expiresAt: now + leaseMs,
        sentAt: now,
      },
    });
    expect(db.state.sessions).toEqual([
      expect.objectContaining({ id: sessionUuid(1), since: startOfTest, heldUntil: now + leaseMs }),
    ]);
  });

  it('writes nothing while more than the margin and one check are left, and says when it runs out (T-295)', async () => {
    let writes = 0;
    const { db, deps, as, clock } = await heldByTablet({}, () => (writes += 1));
    clock.advance(20);
    expect(await renewScoringSession(as(scorekeeperId), own, deps)).toEqual({
      ok: true,
      value: {
        status: 'held-by-you',
        sessionId: sessionUuid(1),
        expiresAt: startOfTest + leaseMs,
        sentAt: startOfTest + 20_000,
      },
    });
    expect(writes).toBe(0);
    expect(db.state.sessions[0]?.heldUntil).toBe(startOfTest + leaseMs);
  });

  it('writes the lease about every half minute, as before T-295, not at every check five seconds apart', async () => {
    let writes = 0;
    const { db, deps, as, clock } = await heldByTablet({}, () => (writes += 1));
    clock.advance(30);
    for (let check = 0; check < 10; check += 1) {
      clock.advance(5);
      expect(await renewScoringSession(as(scorekeeperId), own, deps)).toMatchObject({
        value: { status: 'held-by-you', sessionId: sessionUuid(1) },
      });
    }
    expect(writes).toBe(2);
    // Written once less than the margin and one check were left (at 35 s and 65 s).
    expect(db.state.sessions[0]?.heldUntil).toBe(startOfTest + 65_000 + leaseMs);
  });

  it('checked every 5 s until 55 s, then away 66 s: a second device is still asked to take over (review M2)', async () => {
    const { deps, as, clock } = await heldByTablet();
    for (let s = 5; s <= 55; s += 5) {
      clock.advance(5);
      await renewScoringSession(as(scorekeeperId), own, deps);
    }
    // The phone is locked (or the signal goes) at 55 s, for a 66 s timeout.
    clock.advance(66);
    const second = await openScoringSession(
      as(schedulerId),
      { gameId: gameUuid(1), deviceId: 'phone' },
      deps,
    );
    expect(second).toMatchObject({ value: { status: 'held-by-other' } });
  });

  it('never has less than the margin to spare between two checks five seconds apart (review M2)', async () => {
    const { db, deps, as, clock } = await heldByTablet();
    for (let s = 5; s <= 600; s += 5) {
      clock.advance(5);
      await renewScoringSession(as(scorekeeperId), own, deps);
      const left = (db.state.sessions[0]?.heldUntil ?? 0) - (startOfTest + s * 1000);
      // Five seconds on, before the next check, at least the margin is left.
      expect(left - 5_000).toBeGreaterThanOrEqual(holdSpareMs);
    }
  });

  it('a takeover is answered at the very next check, whatever is left of the lease (T-295)', async () => {
    const { deps, as, clock } = await heldByTablet();
    clock.advance(5);
    const taken = await takeOverScoring(
      as(schedulerId),
      { gameId: gameUuid(1), deviceId: 'phone', confirmed: true, expectedHolderSince: startOfTest },
      deps,
    );
    expect(taken).toMatchObject({ value: { status: 'held-by-you' } });
    expect(await renewScoringSession(as(scorekeeperId), own, deps)).toMatchObject({
      value: { status: 'ended', reason: 'taken-over' },
    });
  });

  it('takes the session id in any capitals', async () => {
    const { deps, as } = await heldByTablet();
    const shouted = { ...own, sessionId: own.sessionId.toUpperCase() };
    expect(await renewScoringSession(as(scorekeeperId), shouted, deps)).toMatchObject({
      value: { status: 'held-by-you' },
    });
  });

  it('carries on a session whose lease ran out while nobody took the game (record 036)', async () => {
    const { deps, as, clock } = await heldByTablet();
    clock.advance(300);
    expect(await renewScoringSession(as(scorekeeperId), own, deps)).toMatchObject({
      value: { status: 'held-by-you', sessionId: sessionUuid(1) },
    });
  });

  it('says ended, and why, once another device took the game after the lease ran out', async () => {
    const { db, deps, as, clock } = await heldByTablet();
    clock.advance(150);
    await openScoringSession(as(schedulerId), { ...tablet, deviceId: 'phone' }, deps);
    expect(await renewScoringSession(as(scorekeeperId), own, deps)).toEqual({
      ok: true,
      value: { status: 'ended', reason: 'taken-over', sentAt: startOfTest + 150_000 },
    });
    expect(db.state.sessions.map((s) => s.id)).toEqual([sessionUuid(2)]);
  });

  it('says ended once the session was released, and does not bring it back', async () => {
    const { db, deps, as } = await heldByTablet();
    await releaseScoringSession(as(scorekeeperId), own, deps);
    expect(await renewScoringSession(as(scorekeeperId), own, deps)).toMatchObject({
      value: { status: 'ended', reason: 'released' },
    });
    expect(db.state.sessions).toEqual([]);
  });

  it('renews only the account’s own session', async () => {
    const { db, deps, as, clock } = await heldByTablet();
    clock.advance(30);
    expect(await renewScoringSession(as(schedulerId), own, deps)).toMatchObject({
      value: { status: 'ended', reason: 'taken-over' },
    });
    expect(db.state.sessions[0]?.heldUntil).toBe(startOfTest + leaseMs);
  });

  it('refuses a scorekeeper whose role was removed, so the lease runs out (T-75)', async () => {
    const { db, deps, as } = await heldByTablet();
    db.state.grants = [{ ...scorekeeperGrant, revokedAt: '2026-12-06T18:00:00.000Z' }];
    expect(await renewScoringSession(as(scorekeeperId), own, deps)).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
  });

  it('refuses a game that is not there', async () => {
    const { deps, as } = await heldByTablet();
    expect(
      await renewScoringSession(as(scorekeeperId), { ...own, gameId: gameUuid(9) }, deps),
    ).toEqual({ ok: false, error: { code: 'game-not-found' } });
  });

  it('refuses once the game is decided or cancelled, so the tracker turns read-only', async () => {
    for (const status of ['final', 'forfeit', 'cancelled']) {
      const { db, deps, as } = await heldByTablet();
      const at = db.state.games.findIndex((g) => g.id === gameUuid(1));
      db.state.games[at] = game(1, { status });
      expect(await renewScoringSession(as(scorekeeperId), own, deps)).toEqual({
        ok: false,
        error: { code: 'game-closed' },
      });
      // Nothing moved: the lease runs out by itself.
      expect(db.state.sessions[0]?.heldUntil).toBe(startOfTest + leaseMs);
    }
  });
});
