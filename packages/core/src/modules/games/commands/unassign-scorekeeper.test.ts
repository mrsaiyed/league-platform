import { describe, expect, it } from 'vitest';
import type { Grant } from '../../access/index.ts';
import {
  finalGame,
  game,
  gameUuid,
  memoryGames,
  ownerId,
  programAdminGrant,
  programAdminId,
  schedulerGrant,
  schedulerId,
  scorekeeperGrant,
  scorekeeperId,
} from '../memory-games.test-helper.ts';
import { unassignScorekeeper } from './unassign-scorekeeper.ts';

const input = { gameId: gameUuid(1), accountId: scorekeeperId };
const grants = [scorekeeperGrant, schedulerGrant, programAdminGrant];

describe('unassignScorekeeper', () => {
  it('takes the scorekeeper off the game and logs it', async () => {
    const other = { gameId: gameUuid(2), accountId: scorekeeperId };
    const { db, deps, as } = memoryGames({
      games: [game(1), game(2)],
      grants,
      assignments: [input, other],
    });
    expect(await unassignScorekeeper(as(ownerId), input, deps)).toEqual({
      ok: true,
      value: input,
    });
    expect(db.state.assignments).toEqual([other]);
    expect(db.state.activity).toEqual([
      expect.objectContaining({
        action: 'games.unassign_scorekeeper',
        targetId: gameUuid(1),
        details: { accountId: scorekeeperId, scopeType: 'program', scopeId: 'p1' },
      }),
    ]);
  });

  it('clears an assignment whatever the game and the person have become', async () => {
    const revoked: Grant = { ...scorekeeperGrant, revokedAt: '2026-12-06T17:00:00.000Z' };
    for (const played of [
      finalGame(1),
      game(1, { status: 'cancelled' }),
      game(1, { binned: true }),
    ]) {
      const { db, deps, as } = memoryGames({
        games: [played],
        grants: [revoked],
        assignments: [input],
      });
      expect(await unassignScorekeeper(as(ownerId), input, deps)).toMatchObject({ ok: true });
      expect(db.state.assignments).toEqual([]);
    }
  });

  it('refuses a missing game and someone not assigned', async () => {
    const { deps, as } = memoryGames({ games: [game(1)], grants });
    const code = async (fields: object) => {
      const result = await unassignScorekeeper(as(ownerId), { ...input, ...fields }, deps);
      return result.ok ? 'ok' : result.error.code;
    };
    expect(await code({ gameId: gameUuid(9) })).toBe('game-not-found');
    expect(await code({})).toBe('not-assigned');
  });

  it("needs games.manage at the game's program", async () => {
    const outcome = async (account: string) => {
      const { deps, as } = memoryGames({ games: [game(1)], grants, assignments: [input] });
      const result = await unassignScorekeeper(as(account), input, deps);
      return result.ok ? 'ok' : result.error.code;
    };
    expect(await outcome(schedulerId)).toBe('ok');
    // A scorekeeper cannot take themselves off, nor can an admin of another program.
    expect(await outcome(scorekeeperId)).toBe('not-allowed');
    expect(await outcome(programAdminId)).toBe('not-allowed');
  });
});
