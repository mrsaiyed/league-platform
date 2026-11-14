import { describe, expect, it } from 'vitest';
import {
  editorGrant,
  editorId,
  game,
  gameUuid,
  schedulerGrant,
  schedulerId,
  scorekeeperGrant,
  scorekeeperId,
} from '../memory-games.test-helper.ts';
import { memoryScoring, sessionUuid, startOfTest } from '../memory-scoring.test-helper.ts';
import { openScoringSession } from './open-scoring-session.ts';
import { releaseScoringSession } from './release-scoring-session.ts';
import { takeOverScoring } from './take-over-scoring.ts';

const grants = [scorekeeperGrant, schedulerGrant, editorGrant];
const tablet = { gameId: gameUuid(1), deviceId: 'tablet' };
const phone = { gameId: gameUuid(1), deviceId: 'phone' };
const own = { gameId: gameUuid(1), sessionId: sessionUuid(1) };

async function heldByTablet() {
  const league = memoryScoring({ games: [game(1)], grants });
  await openScoringSession(league.as(scorekeeperId), tablet, league.deps);
  return league;
}

describe('releaseScoringSession (T6 §5)', () => {
  it('frees the game at once, so another device can open it straight away', async () => {
    const { db, deps, as } = await heldByTablet();
    expect(await releaseScoringSession(as(scorekeeperId), own, deps)).toEqual({
      ok: true,
      value: { status: 'ended', reason: 'released', sentAt: startOfTest },
    });
    expect(db.state.sessions).toEqual([]);
    expect(await openScoringSession(as(schedulerId), phone, deps)).toMatchObject({
      value: { status: 'held-by-you', sessionId: sessionUuid(2) },
    });
  });

  it('leaves the new holder alone when the session was already taken over', async () => {
    const { db, deps, as } = await heldByTablet();
    await takeOverScoring(
      as(schedulerId),
      { ...phone, confirmed: true, expectedHolderSince: startOfTest },
      deps,
    );
    expect(await releaseScoringSession(as(scorekeeperId), own, deps)).toMatchObject({
      value: { status: 'ended', reason: 'taken-over' },
    });
    expect(db.state.sessions.map((s) => s.id)).toEqual([sessionUuid(2)]);
  });

  it('releases only the account’s own session', async () => {
    const { db, deps, as } = await heldByTablet();
    expect(await releaseScoringSession(as(schedulerId), own, deps)).toMatchObject({
      value: { status: 'ended', reason: 'taken-over' },
    });
    expect(db.state.sessions.map((s) => s.id)).toEqual([sessionUuid(1)]);
  });

  it('answers released for a session already gone', async () => {
    const { deps, as } = await heldByTablet();
    await releaseScoringSession(as(scorekeeperId), own, deps);
    expect(await releaseScoringSession(as(scorekeeperId), own, deps)).toMatchObject({
      value: { status: 'ended', reason: 'released' },
    });
  });

  it('refuses whoever may not score the game', async () => {
    const { db, deps, as } = await heldByTablet();
    expect(await releaseScoringSession(as(editorId), own, deps)).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
    expect(db.state.sessions).toHaveLength(1);
  });
});
