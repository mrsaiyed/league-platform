import { describe, expect, it } from 'vitest';
import {
  editorGrant,
  editorId,
  finalGame,
  game,
  gameUuid,
  ownerId,
  schedulerGrant,
  schedulerId,
  scorekeeperGrant,
  scorekeeperId,
} from '../memory-games.test-helper.ts';
import {
  memoryScoring,
  racingScoring,
  sessionUuid,
  startOfTest,
} from '../memory-scoring.test-helper.ts';
import { leaseMs } from '../scoring-session.ts';
import { openScoringSession } from './open-scoring-session.ts';
import { renewScoringSession } from './renew-scoring-session.ts';
import { takeOverScoring } from './take-over-scoring.ts';

const grants = [scorekeeperGrant, schedulerGrant, editorGrant];
const tablet = { gameId: gameUuid(1), deviceId: 'tablet' };
const takeOver = (since = startOfTest) => ({
  gameId: gameUuid(1),
  deviceId: 'phone',
  confirmed: true,
  expectedHolderSince: since,
});

/** The scorekeeper's tablet holds game 1; the clock is then 30 seconds on. */
async function heldByTablet() {
  const league = memoryScoring({ games: [game(1), finalGame(2)], grants });
  await openScoringSession(league.as(scorekeeperId), tablet, league.deps);
  league.clock.advance(30);
  return league;
}

describe('takeOverScoring (T6 §5, S-5, T-116)', () => {
  it('ends the holder’s session and starts a new one; the first device is ended from then on', async () => {
    const { db, deps, as } = await heldByTablet();
    const now = startOfTest + 30_000;
    expect(await takeOverScoring(as(schedulerId), takeOver(), deps)).toEqual({
      ok: true,
      value: {
        status: 'held-by-you',
        sessionId: sessionUuid(2),
        expiresAt: now + leaseMs,
        sentAt: now,
      },
    });
    expect(db.state.sessions).toEqual([
      {
        id: sessionUuid(2),
        gameId: gameUuid(1),
        accountId: schedulerId,
        deviceId: 'phone',
        since: now,
        heldUntil: now + leaseMs,
      },
    ]);
    expect(
      await renewScoringSession(
        as(scorekeeperId),
        { gameId: gameUuid(1), sessionId: sessionUuid(1) },
        deps,
      ),
    ).toEqual({ ok: true, value: { status: 'ended', reason: 'taken-over', sentAt: now } });
    expect(db.state.activity).toEqual([
      expect.objectContaining({
        actorAccountId: schedulerId,
        action: 'games.take_over_scoring',
        targetType: 'game',
        targetId: gameUuid(1),
        details: { takenFromAccountId: scorekeeperId, scopeType: 'program', scopeId: 'p1' },
      }),
    ]);
  });

  it('lets the same account move to another device', async () => {
    const { db, deps, as } = await heldByTablet();
    expect(await takeOverScoring(as(scorekeeperId), takeOver(), deps)).toMatchObject({
      value: { status: 'held-by-you', sessionId: sessionUuid(2) },
    });
    expect(db.state.sessions).toEqual([expect.objectContaining({ deviceId: 'phone' })]);
  });

  it('logs no takeover when the holder left just before it, as nobody was displaced', async () => {
    const tabletSession = {
      id: sessionUuid(90),
      gameId: gameUuid(1),
      accountId: scorekeeperId,
      deviceId: 'tablet',
      since: startOfTest,
      heldUntil: startOfTest + leaseMs,
    };
    const { db, deps, as } = memoryScoring(
      { games: [game(1)], grants, sessions: [tabletSession] },
      // The tablet leaves the game between this request reading it and ending it.
      { beforeEnd: (s) => void (s.sessions = []) },
    );
    expect(await takeOverScoring(as(schedulerId), takeOver(), deps)).toMatchObject({
      value: { status: 'held-by-you', sessionId: sessionUuid(1) },
    });
    expect(db.state.activity).toEqual([]);
  });

  it('two takeovers at the same instant: one takes the game, one is told, one entry is logged', async () => {
    const tabletSession = {
      id: sessionUuid(90),
      gameId: gameUuid(1),
      accountId: scorekeeperId,
      deviceId: 'tablet',
      since: startOfTest,
      heldUntil: startOfTest + leaseMs,
    };
    const race = racingScoring(2, { games: [game(1)], grants, sessions: [tabletSession] });
    const replies = await Promise.all([
      takeOverScoring(race.as(schedulerId), takeOver(), race.deps),
      takeOverScoring(race.as(ownerId), { ...takeOver(), deviceId: 'laptop' }, race.deps),
    ]);
    expect(replies.map((r) => (r.ok ? r.value.status : r.error.code)).sort()).toEqual([
      'held-by-other',
      'held-by-you',
    ]);
    expect(race.db.state.sessions).toEqual([expect.objectContaining({ id: sessionUuid(1) })]);
    expect(race.db.state.activity).toEqual([
      expect.objectContaining({
        action: 'games.take_over_scoring',
        actorAccountId: race.db.state.sessions[0]?.accountId,
        details: expect.objectContaining({ takenFromAccountId: scorekeeperId }),
      }),
    ]);
  });

  it('takes nothing if the game changed hands since the scorekeeper confirmed', async () => {
    const { db, deps, as } = await heldByTablet();
    expect(await takeOverScoring(as(schedulerId), takeOver(startOfTest - 1), deps)).toEqual({
      ok: true,
      value: {
        status: 'held-by-other',
        holder: { accountId: scorekeeperId, since: startOfTest },
        sentAt: startOfTest + 30_000,
      },
    });
    expect(db.state.sessions.map((s) => s.id)).toEqual([sessionUuid(1)]);
    expect(db.state.activity).toEqual([]);
  });

  it('simply opens a game that is free by then, or whose lease ran out, with nothing logged', async () => {
    const free = memoryScoring({ games: [game(1)], grants });
    expect(await takeOverScoring(free.as(schedulerId), takeOver(), free.deps)).toMatchObject({
      value: { status: 'held-by-you', sessionId: sessionUuid(1) },
    });
    const lapsed = await heldByTablet();
    lapsed.clock.advance(120);
    expect(await takeOverScoring(lapsed.as(schedulerId), takeOver(0), lapsed.deps)).toMatchObject({
      value: { status: 'held-by-you', sessionId: sessionUuid(2) },
    });
    expect([...free.db.state.activity, ...lapsed.db.state.activity]).toEqual([]);
  });

  it('keeps the session of a device taking over from itself', async () => {
    const { db, deps, as } = await heldByTablet();
    expect(
      await takeOverScoring(as(scorekeeperId), { ...takeOver(), deviceId: 'tablet' }, deps),
    ).toMatchObject({ value: { status: 'held-by-you', sessionId: sessionUuid(1) } });
    expect(db.state.activity).toEqual([]);
  });

  it('needs the scorekeeper to have confirmed', async () => {
    const { db, deps, as } = await heldByTablet();
    for (const confirmed of [false, undefined]) {
      expect(
        await takeOverScoring(as(schedulerId), { ...takeOver(), confirmed }, deps),
      ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    }
    expect(db.state.sessions.map((s) => s.id)).toEqual([sessionUuid(1)]);
  });

  it('refuses whoever may not score the game, and a decided game', async () => {
    const { db, deps, as } = await heldByTablet();
    expect(await takeOverScoring(as(editorId), takeOver(), deps)).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
    expect(
      await takeOverScoring(as(schedulerId), { ...takeOver(), gameId: gameUuid(2) }, deps),
    ).toEqual({ ok: false, error: { code: 'game-closed' } });
    expect(db.state.sessions.map((s) => s.id)).toEqual([sessionUuid(1)]);
  });
});
