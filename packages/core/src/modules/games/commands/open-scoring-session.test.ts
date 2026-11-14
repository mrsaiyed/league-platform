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
  scoringRule,
} from '../memory-games.test-helper.ts';
import {
  memoryScoring,
  racingScoring,
  sessionUuid,
  startOfTest,
} from '../memory-scoring.test-helper.ts';
import { leaseMs } from '../scoring-session.ts';
import { openScoringSession } from './open-scoring-session.ts';

const grants = [scorekeeperGrant, schedulerGrant, editorGrant];
const tablet = { gameId: gameUuid(1), deviceId: 'tablet' };
const phone = { gameId: gameUuid(1), deviceId: 'phone' };

const league = (options: Parameters<typeof memoryScoring>[1] = {}) =>
  memoryScoring({ games: [game(1)], grants }, options);

describe('openScoringSession (T6 §5, T-116)', () => {
  it('takes a free game for this account and device, for two minutes', async () => {
    const { db, deps, as } = league();
    expect(await openScoringSession(as(scorekeeperId), tablet, deps)).toEqual({
      ok: true,
      value: {
        status: 'held-by-you',
        sessionId: sessionUuid(1),
        expiresAt: startOfTest + leaseMs,
        sentAt: startOfTest,
      },
    });
    expect(db.state.sessions).toEqual([
      {
        id: sessionUuid(1),
        gameId: gameUuid(1),
        accountId: scorekeeperId,
        deviceId: 'tablet',
        since: startOfTest,
        heldUntil: startOfTest + leaseMs,
      },
    ]);
  });

  it('tells a second scorekeeper who holds the game, and changes nothing', async () => {
    const { db, deps, as, clock } = league();
    await openScoringSession(as(scorekeeperId), tablet, deps);
    clock.advance(30);
    expect(await openScoringSession(as(schedulerId), phone, deps)).toEqual({
      ok: true,
      value: {
        status: 'held-by-other',
        holder: { accountId: scorekeeperId, since: startOfTest },
        sentAt: startOfTest + 30_000,
      },
    });
    expect(db.state.sessions.map((s) => s.id)).toEqual([sessionUuid(1)]);
  });

  it('treats the same account on another device as someone else holding it', async () => {
    const { deps, as } = league();
    await openScoringSession(as(scorekeeperId), tablet, deps);
    expect(await openScoringSession(as(scorekeeperId), phone, deps)).toMatchObject({
      ok: true,
      value: { status: 'held-by-other', holder: { accountId: scorekeeperId } },
    });
  });

  it('carries on with the same session when the same device opens the game again', async () => {
    const { db, deps, as, clock } = league();
    await openScoringSession(as(scorekeeperId), tablet, deps);
    clock.advance(90);
    expect(await openScoringSession(as(scorekeeperId), tablet, deps)).toMatchObject({
      ok: true,
      value: { sessionId: sessionUuid(1), expiresAt: startOfTest + 90_000 + leaseMs },
    });
    expect(db.state.sessions).toHaveLength(1);
  });

  it('frees a game whose lease has run out: the next device takes it with a new session', async () => {
    const { db, deps, as, clock } = league();
    await openScoringSession(as(scorekeeperId), tablet, deps);
    clock.advance(119);
    expect(await openScoringSession(as(schedulerId), phone, deps)).toMatchObject({
      value: { status: 'held-by-other' },
    });
    // The lease runs out at exactly two minutes.
    clock.advance(1);
    expect(await openScoringSession(as(schedulerId), phone, deps)).toEqual({
      ok: true,
      value: {
        status: 'held-by-you',
        sessionId: sessionUuid(2),
        expiresAt: startOfTest + 120_000 + leaseMs,
        sentAt: startOfTest + 120_000,
      },
    });
    expect(db.state.sessions).toEqual([
      expect.objectContaining({ id: sessionUuid(2), accountId: schedulerId, deviceId: 'phone' }),
    ]);
  });

  it('a lapsed session nobody took is carried on by its own device (record 036)', async () => {
    const { db, deps, as, clock } = league();
    await openScoringSession(as(scorekeeperId), tablet, deps);
    clock.advance(600);
    expect(await openScoringSession(as(scorekeeperId), tablet, deps)).toMatchObject({
      value: { status: 'held-by-you', sessionId: sessionUuid(1) },
    });
    expect(db.state.sessions).toHaveLength(1);
  });

  it('two devices opening at the same instant: both see a free game, only one gets it', async () => {
    // Each request waits after reading the game's session until the other has read it
    // too, so both find it free before either writes; neither can finish alone.
    const race = racingScoring(2, { games: [game(1)], grants });
    const replies = await Promise.all([
      openScoringSession(race.as(scorekeeperId), tablet, race.deps),
      openScoringSession(race.as(schedulerId), phone, race.deps),
    ]);
    const winner = race.db.state.sessions;
    expect(winner).toHaveLength(1);
    expect(replies.map((r) => (r.ok ? r.value.status : r.error.code)).sort()).toEqual([
      'held-by-other',
      'held-by-you',
    ]);
    const lost = replies.find((r) => r.ok && r.value.status === 'held-by-other');
    expect(lost).toEqual({
      ok: true,
      value: {
        status: 'held-by-other',
        holder: { accountId: winner[0]?.accountId, since: startOfTest },
        sentAt: startOfTest,
      },
    });
  });

  it('two devices taking a lapsed game at the same instant: only one gets it', async () => {
    const lapsed = {
      id: sessionUuid(90),
      gameId: gameUuid(1),
      accountId: ownerId,
      deviceId: 'laptop',
      since: startOfTest - 600_000,
      heldUntil: startOfTest - 1,
    };
    const race = racingScoring(2, { games: [game(1)], grants, sessions: [lapsed] });
    const replies = await Promise.all([
      openScoringSession(race.as(scorekeeperId), tablet, race.deps),
      openScoringSession(race.as(schedulerId), phone, race.deps),
    ]);
    expect(replies.map((r) => (r.ok ? r.value.status : r.error.code)).sort()).toEqual([
      'held-by-other',
      'held-by-you',
    ]);
    expect(race.db.state.sessions).toEqual([
      expect.objectContaining({ id: sessionUuid(1), since: startOfTest }),
    ]);
  });

  it('when two devices race, the one that started second is told who won', async () => {
    // Another request starts a session between this one reading and writing.
    const { db, deps, as } = league({
      beforeStart: (s) => {
        if (s.sessions.length > 0) return;
        s.sessions.push({
          id: sessionUuid(99),
          gameId: gameUuid(1),
          accountId: schedulerId,
          deviceId: 'phone',
          since: startOfTest,
          heldUntil: startOfTest + leaseMs,
        });
      },
    });
    expect(await openScoringSession(as(scorekeeperId), tablet, deps)).toEqual({
      ok: true,
      value: {
        status: 'held-by-other',
        holder: { accountId: schedulerId, since: startOfTest },
        sentAt: startOfTest,
      },
    });
    expect(db.state.sessions.map((s) => s.id)).toEqual([sessionUuid(99)]);
  });

  it('refuses a game that is missing, binned, decided or cancelled', async () => {
    const { db, deps, as } = memoryScoring({
      games: [game(2, { binned: true }), finalGame(3), game(4, { status: 'cancelled' })],
      grants,
    });
    const code = async (n: number) => {
      const result = await openScoringSession(
        as(ownerId),
        { gameId: gameUuid(n), deviceId: 'tablet' },
        deps,
      );
      return result.ok ? 'ok' : result.error.code;
    };
    expect(await code(1)).toBe('game-not-found');
    expect(await code(2)).toBe('game-not-found');
    expect(await code(3)).toBe('game-closed');
    expect(await code(4)).toBe('game-closed');
    expect(db.state.sessions).toEqual([]);
  });

  it('refuses whoever may not score the game: an editor, a visitor, an unassigned scorekeeper', async () => {
    const { deps, as } = league();
    for (const account of [editorId, null]) {
      expect(await openScoringSession(as(account), tablet, deps)).toEqual({
        ok: false,
        error: { code: 'not-allowed' },
      });
    }
    const assignedOnly = memoryScoring({
      games: [game(1)],
      grants,
      settings: scoringRule('assignedOnly'),
    });
    expect(
      await openScoringSession(assignedOnly.as(scorekeeperId), tablet, assignedOnly.deps),
    ).toEqual({ ok: false, error: { code: 'not-allowed' } });
  });

  it('needs a device id the database accepts', async () => {
    const { deps, as } = league();
    for (const deviceId of ['', '   ', 'x'.repeat(201)]) {
      expect(
        await openScoringSession(as(scorekeeperId), { gameId: gameUuid(1), deviceId }, deps),
      ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    }
  });
});
