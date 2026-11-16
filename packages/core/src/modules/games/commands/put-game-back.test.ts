import { describe, expect, it } from 'vitest';
import {
  finalGame,
  game,
  gameUuid,
  memoryGames,
  otherSeasonId,
  ownerId,
  programAdminGrant,
  programAdminId,
  schedulerGrant,
  schedulerId,
  scorekeeperGrant,
  scorekeeperId,
} from '../memory-games.test-helper.ts';
import { cancelGame } from './cancel-game.ts';
import { putGameBack } from './put-game-back.ts';

const input = { gameId: gameUuid(1), version: 1, reason: 'cancelledByMistake' };

describe('putGameBack', () => {
  it('makes a cancelled game a scheduled game again, at its date, and logs who and why', async () => {
    const startsAt = '2026-12-08T19:00:00.000Z';
    const { db, deps, as, events } = memoryGames({
      games: [game(1, { status: 'cancelled', startsAt })],
    });
    expect(await putGameBack(as(ownerId), input, deps)).toEqual({
      ok: true,
      value: { version: 2 },
    });
    expect(db.state.games[0]).toMatchObject({
      status: 'scheduled',
      startsAt,
      homeScore: null,
      awayScore: null,
      finalizedAt: null,
    });
    expect(db.state.activity).toEqual([
      {
        actorAccountId: ownerId,
        action: 'games.put_game_back',
        targetType: 'game',
        targetId: gameUuid(1),
        summary: 'activity.games.put_game_back',
        details: { reason: 'cancelledByMistake' },
      },
    ]);
    // Nothing is announced: a cancelled game never counted, so the standings do not move.
    expect(events).toEqual([]);
  });

  it('undoes a cancellation: cancelled, then put back, the game is as it was', async () => {
    const { db, deps, as } = memoryGames({ games: [game(1)] });
    const before = { ...db.state.games[0] };
    expect(await cancelGame(as(ownerId), { gameId: gameUuid(1), version: 1 }, deps)).toMatchObject({
      ok: true,
    });
    expect(
      await putGameBack(as(ownerId), { ...input, version: 2, reason: 'wrongGame' }, deps),
    ).toMatchObject({ ok: true });
    expect(db.state.games[0]).toEqual({ ...before, version: 3 });
    expect(db.state.activity.map((a) => [a.action, a.details])).toEqual([
      ['games.cancel_game', {}],
      ['games.put_game_back', { reason: 'wrongGame' }],
    ]);
  });

  it('keeps what a scorer’s table set for the game: its events are not touched', async () => {
    const { db, deps, as } = memoryGames({
      games: [game(1, { status: 'cancelled' })],
      tracked: [gameUuid(1)],
    });
    expect(await putGameBack(as(ownerId), input, deps)).toMatchObject({ ok: true });
    expect(db.state.tracked).toEqual([gameUuid(1)]);
  });

  it('refuses a game that is not cancelled, missing, in the bin or moved on', async () => {
    const { db, deps, as } = memoryGames({
      games: [
        game(1, { status: 'cancelled', version: 2 }),
        game(2),
        game(3, { status: 'postponed' }),
        game(4, { status: 'live' }),
        finalGame(5),
        game(6, { status: 'cancelled', binned: true }),
      ],
    });
    const code = async (n: number, version = 1) => {
      const result = await putGameBack(
        as(ownerId),
        { gameId: gameUuid(n), version, reason: 'other' },
        deps,
      );
      return result.ok ? 'ok' : result.error.code;
    };
    expect(await code(1)).toBe('changed-since-read');
    expect(await code(2)).toBe('game-not-cancelled');
    expect(await code(3)).toBe('game-not-cancelled');
    expect(await code(4)).toBe('game-not-cancelled');
    expect(await code(5)).toBe('game-not-cancelled');
    expect(await code(6)).toBe('game-not-found');
    expect(await code(8)).toBe('game-not-found');
    expect(db.state.activity).toEqual([]);
  });

  it('takes a reason from the fixed list only', async () => {
    const { deps, as } = memoryGames({ games: [game(1, { status: 'cancelled' })] });
    for (const reason of ['', 'because I said so', undefined]) {
      expect(await putGameBack(as(ownerId), { ...input, reason }, deps)).toMatchObject({
        error: { code: 'invalid-input' },
      });
    }
  });

  it('is for whoever may cancel the game: games.results at its program', async () => {
    const { deps, as } = memoryGames({
      games: [
        game(1, { status: 'cancelled' }),
        game(2, { status: 'cancelled', seasonId: otherSeasonId }),
      ],
      grants: [schedulerGrant, scorekeeperGrant, programAdminGrant],
    });
    expect(await putGameBack(as(scorekeeperId), input, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(await putGameBack(as(null), input, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    // An admin of program p2 only: not a game of the first season's program (p1)…
    expect(await putGameBack(as(programAdminId), input, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    // …but a game of the other season, which is of p2.
    expect(
      await putGameBack(as(programAdminId), { ...input, gameId: gameUuid(2) }, deps),
    ).toMatchObject({ ok: true });
    expect(await putGameBack(as(schedulerId), input, deps)).toMatchObject({ ok: true });
  });
});
