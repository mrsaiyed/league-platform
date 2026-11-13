import { describe, expect, it } from 'vitest';
import {
  finalGame,
  game,
  gameUuid,
  memoryGames,
  ownerId,
  schedulerGrant,
  schedulerId,
  scorekeeperGrant,
  scorekeeperId,
} from '../memory-games.test-helper.ts';
import { cancelGame } from './cancel-game.ts';
import { postponeGame } from './postpone-game.ts';

const input = { gameId: gameUuid(1), version: 1 };

describe('postponeGame', () => {
  it('moves a scheduled game to the waiting list without announcing anything', async () => {
    const { db, deps, as, events } = memoryGames({ games: [game(1)] });
    expect(await postponeGame(as(ownerId), input, deps)).toMatchObject({ ok: true });
    expect(db.state.games[0]).toMatchObject({ status: 'postponed', homeScore: null });
    expect(db.state.activity.map((a) => a.action)).toEqual(['games.postpone_game']);
    expect(events).toEqual([]);
  });

  it('refuses games that are not scheduled, decided, missing or moved on', async () => {
    const { deps, as } = memoryGames({
      games: [game(1), game(2, { status: 'postponed' }), game(3, { status: 'live' }), finalGame(4)],
    });
    const code = async (extra: object) => {
      const result = await postponeGame(as(ownerId), { ...input, ...extra }, deps);
      return result.ok ? 'ok' : result.error.code;
    };
    expect(await code({ gameId: gameUuid(2) })).toBe('game-not-postponable');
    expect(await code({ gameId: gameUuid(3) })).toBe('game-not-postponable');
    expect(await code({ gameId: gameUuid(4) })).toBe('game-already-decided');
    expect(await code({ gameId: gameUuid(8) })).toBe('game-not-found');
    expect(await code({ version: 2 })).toBe('changed-since-read');
  });

  it('needs games.results', async () => {
    const { deps, as } = memoryGames({
      games: [game(1)],
      grants: [schedulerGrant, scorekeeperGrant],
    });
    expect(await postponeGame(as(scorekeeperId), input, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(await postponeGame(as(schedulerId), input, deps)).toMatchObject({ ok: true });
  });
});

describe('cancelGame', () => {
  it('cancels a scheduled or postponed game so it counts for nothing', async () => {
    const { db, deps, as } = memoryGames({ games: [game(1), game(2, { status: 'postponed' })] });
    expect(await cancelGame(as(ownerId), input, deps)).toMatchObject({ ok: true });
    expect(await cancelGame(as(ownerId), { gameId: gameUuid(2), version: 1 }, deps)).toMatchObject({
      ok: true,
    });
    expect(db.state.games.map((g) => g.status)).toEqual(['cancelled', 'cancelled']);
    expect(db.state.activity.map((a) => a.action)).toEqual([
      'games.cancel_game',
      'games.cancel_game',
    ]);
  });

  it('refuses live, decided and already cancelled games', async () => {
    const { deps, as } = memoryGames({
      games: [
        game(1, { status: 'live' }),
        finalGame(2),
        game(3, { status: 'cancelled' }),
        game(4, { binned: true }),
      ],
    });
    const code = async (n: number) => {
      const result = await cancelGame(as(ownerId), { gameId: gameUuid(n), version: 1 }, deps);
      return result.ok ? 'ok' : result.error.code;
    };
    expect(await code(1)).toBe('game-not-cancellable');
    expect(await code(2)).toBe('game-already-decided');
    expect(await code(3)).toBe('game-not-cancellable');
    expect(await code(4)).toBe('game-not-found');
  });

  it('needs games.results', async () => {
    const { deps, as } = memoryGames({ games: [game(1)], grants: [scorekeeperGrant] });
    expect(await cancelGame(as(scorekeeperId), input, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});
