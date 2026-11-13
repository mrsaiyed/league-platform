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
import { leaseMs } from '../scoring-session.ts';
import { openScoringSession } from './open-scoring-session.ts';
import { releaseScoringSession } from './release-scoring-session.ts';
import { renewScoringSession } from './renew-scoring-session.ts';

const grants = [scorekeeperGrant, schedulerGrant];
const tablet = { gameId: gameUuid(1), deviceId: 'tablet' };
const own = { gameId: gameUuid(1), sessionId: sessionUuid(1) };

async function heldByTablet(state: { grants?: Grant[] } = {}) {
  const league = memoryScoring({ games: [game(1)], grants, ...state });
  await openScoringSession(league.as(scorekeeperId), tablet, league.deps);
  return league;
}

describe('renewScoringSession (T-116)', () => {
  it('runs the lease on for two minutes from now', async () => {
    const { db, deps, as, clock } = await heldByTablet();
    clock.advance(30);
    const now = startOfTest + 30_000;
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
});
