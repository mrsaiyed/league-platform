import { describe, expect, it } from 'vitest';
import type { Grant } from '../../access/index.ts';
import {
  editorGrant,
  editorId,
  finalGame,
  game,
  gameUuid,
  memoryGames,
  otherSeasonId,
  ownerId,
  programAdminGrant,
  programAdminId,
  programScorekeeperGrant,
  programScorekeeperId,
  schedulerGrant,
  schedulerId,
  scorekeeperGrant,
  scorekeeperId,
} from '../memory-games.test-helper.ts';
import { assignScorekeeper } from './assign-scorekeeper.ts';

const input = { gameId: gameUuid(1), accountId: scorekeeperId };
const grants = [scorekeeperGrant, schedulerGrant, editorGrant, programAdminGrant];

describe('assignScorekeeper', () => {
  it('assigns a scorekeeper to a game and logs it with its program', async () => {
    const { db, deps, as } = memoryGames({ games: [game(1)], grants });
    expect(await assignScorekeeper(as(ownerId), input, deps)).toEqual({
      ok: true,
      value: input,
    });
    expect(db.state.assignments).toEqual([input]);
    expect(db.state.activity).toEqual([
      expect.objectContaining({
        action: 'games.assign_scorekeeper',
        targetType: 'game',
        targetId: gameUuid(1),
        details: { accountId: scorekeeperId, scopeType: 'program', scopeId: 'p1' },
      }),
    ]);
  });

  it('takes an account id in any capitals, as the database spells it', async () => {
    const { db, deps, as } = memoryGames({ games: [game(1)], grants });
    const shouted = { ...input, accountId: scorekeeperId.toUpperCase() };
    expect(await assignScorekeeper(as(ownerId), shouted, deps)).toMatchObject({ ok: true });
    expect(db.state.assignments).toEqual([input]);
  });

  it('assigns anyone who may score the game, a scheduler too, and no one else', async () => {
    const code = async (accountId: string, gameFields = {}) => {
      const { deps, as } = memoryGames({
        games: [game(1, gameFields)],
        grants: [...grants, programScorekeeperGrant],
      });
      const result = await assignScorekeeper(as(ownerId), { ...input, accountId }, deps);
      return result.ok ? 'ok' : result.error.code;
    };
    expect(await code(schedulerId)).toBe('ok');
    expect(await code(ownerId)).toBe('ok');
    expect(await code(editorId)).toBe('cannot-score-game');
    // Someone with no role here, and a scorekeeper of another program.
    expect(await code('01900000-0000-7000-8000-0000000000ff')).toBe('cannot-score-game');
    expect(await code(programScorekeeperId)).toBe('cannot-score-game');
    expect(await code(programScorekeeperId, { seasonId: otherSeasonId })).toBe('ok');
  });

  it('refuses someone whose scorekeeper role was removed (T-75)', async () => {
    const revoked: Grant = { ...scorekeeperGrant, revokedAt: '2026-12-06T17:00:00.000Z' };
    const { db, deps, as } = memoryGames({ games: [game(1)], grants: [revoked] });
    expect(await assignScorekeeper(as(ownerId), input, deps)).toEqual({
      ok: false,
      error: { code: 'cannot-score-game' },
    });
    expect(db.state.assignments).toEqual([]);
  });

  it('refuses a missing, binned, decided or cancelled game, and a second assignment', async () => {
    const { deps, as } = memoryGames({
      games: [
        game(1),
        game(2, { binned: true }),
        finalGame(3),
        game(4, { status: 'cancelled' }),
        game(5, { status: 'forfeit' }),
      ],
      grants,
      assignments: [input],
    });
    const code = async (n: number) => {
      const result = await assignScorekeeper(as(ownerId), { ...input, gameId: gameUuid(n) }, deps);
      return result.ok ? 'ok' : result.error.code;
    };
    expect(await code(9)).toBe('game-not-found');
    expect(await code(2)).toBe('game-not-found');
    expect(await code(3)).toBe('game-closed');
    expect(await code(4)).toBe('game-closed');
    expect(await code(5)).toBe('game-closed');
    expect(await code(1)).toBe('already-assigned');
  });

  it('assigns a postponed or live game: it is still to be scored', async () => {
    for (const status of ['postponed', 'live']) {
      const { deps, as } = memoryGames({ games: [game(1, { status })], grants });
      expect(await assignScorekeeper(as(ownerId), input, deps)).toMatchObject({ ok: true });
    }
  });

  it("needs games.manage at the game's program, and a league that is not read-only", async () => {
    const outcome = async (account: string, status = 'published') => {
      const { deps, as } = memoryGames({ games: [game(1)], grants, status });
      const result = await assignScorekeeper(as(account), input, deps);
      return result.ok ? 'ok' : result.error.code;
    };
    expect(await outcome(schedulerId)).toBe('ok');
    expect(await outcome(scorekeeperId)).toBe('not-allowed');
    expect(await outcome(editorId)).toBe('not-allowed');
    expect(await outcome(programAdminId)).toBe('not-allowed');
    expect(await outcome(ownerId, 'archived')).toBe('not-allowed');
  });
});
