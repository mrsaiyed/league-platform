import { describe, expect, it } from 'vitest';
import {
  game,
  gameId,
  memoryStandings,
  ownerId,
  seasonId,
  teamId,
} from '../memory-standings.test-helper.ts';
import { overturnResult } from './overturn-result.ts';
import { removeAdjustment } from './remove-adjustment.ts';

// Team 1 beat team 2 60–50; team 2 beat team 3 55–40.
const games = [
  game(1, 1, 2, {
    status: 'final',
    homeScore: 60,
    awayScore: 50,
    finalizedAt: '2026-12-20T20:00:00.000Z',
  }),
  game(2, 2, 3, {
    status: 'final',
    homeScore: 55,
    awayScore: 40,
    finalizedAt: '2026-12-21T20:00:00.000Z',
  }),
];
const input = { seasonId, gameId: gameId(1), reason: 'Ineligible player, game 1' };
const row = (rows: readonly { teamId: string }[] | undefined, n: number) =>
  rows?.find((r) => r.teamId === teamId(n));

describe('overturnResult', () => {
  it('moves one win from the winner to the loser, both halves at once, and logs it', async () => {
    const { db, deps, as } = memoryStandings({ games });
    const result = await overturnResult(as(ownerId), input, deps);
    expect(result.ok).toBe(true);
    expect(db.state.adjustments).toEqual([
      expect.objectContaining({ teamId: teamId(1), wins: -1, losses: 1 }),
      expect.objectContaining({
        teamId: teamId(2),
        wins: 1,
        losses: -1,
        pairedWith: db.state.adjustments[0]?.id,
      }),
    ]);
    const rows = db.state.rows[seasonId];
    expect(row(rows, 1)).toMatchObject({ gamesPlayed: 1, wins: 0, losses: 1 });
    expect(row(rows, 2)).toMatchObject({ gamesPlayed: 2, wins: 2, losses: 0 });
    expect(db.state.activity).toEqual([
      expect.objectContaining({ action: 'standings.overturn_result', targetId: seasonId }),
    ]);
    expect(db.state.activity[0]?.details).toMatchObject({
      game: gameId(1),
      team: teamId(2),
      from: teamId(1),
      reason: 'Ineligible player, game 1',
    });
  });

  it('takes both halves off when either is taken off', async () => {
    const { db, deps, as } = memoryStandings({ games });
    await overturnResult(as(ownerId), input, deps);
    const second = db.state.adjustments[1]?.id ?? '';
    expect((await removeAdjustment(as(ownerId), { seasonId, adjustmentId: second }, deps)).ok).toBe(
      true,
    );
    const rows = db.state.rows[seasonId];
    expect(row(rows, 1)).toMatchObject({ wins: 1, losses: 0 });
    expect(row(rows, 2)).toMatchObject({ wins: 1, losses: 1 });
  });

  it('refuses a game that is not decided in the season, saving nothing', async () => {
    const { db, deps, as } = memoryStandings({ games });
    expect(await overturnResult(as(ownerId), { ...input, gameId: gameId(9) }, deps)).toEqual({
      ok: false,
      error: { code: 'game-not-found' },
    });
    expect(db.state.adjustments).toEqual([]);
    expect(db.state.activity).toEqual([]);
  });
});
