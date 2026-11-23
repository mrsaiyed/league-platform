import { describe, expect, it } from 'vitest';
import {
  game,
  memoryStandings,
  ownerId,
  seasonId,
  teamId,
} from '../memory-standings.test-helper.ts';
import { awardGame } from './award-game.ts';
import { removeAdjustment } from './remove-adjustment.ts';

const games = [
  game(1, 1, 2, {
    status: 'final',
    homeScore: 60,
    awayScore: 50,
    finalizedAt: '2026-12-20T20:00:00.000Z',
  }),
];
const input = {
  seasonId,
  winnerTeamId: teamId(2),
  loserTeamId: teamId(1),
  reason: 'Round 4 not played: awarded by the league',
};
const row = (rows: readonly { teamId: string }[] | undefined, n: number) =>
  rows?.find((r) => r.teamId === teamId(n));

describe('awardGame', () => {
  it('gives one team a win and the other a loss, a game played each, and logs it', async () => {
    const { db, deps, as } = memoryStandings({ games });
    expect((await awardGame(as(ownerId), input, deps)).ok).toBe(true);
    expect(db.state.adjustments).toEqual([
      expect.objectContaining({ teamId: teamId(2), wins: 1, losses: 0, gamesPlayed: 1 }),
      expect.objectContaining({ teamId: teamId(1), wins: 0, losses: 1, gamesPlayed: 1 }),
    ]);
    const rows = db.state.rows[seasonId];
    // Each record adds up: games played is wins plus losses.
    expect(row(rows, 2)).toMatchObject({ gamesPlayed: 2, wins: 1, losses: 1 });
    expect(row(rows, 1)).toMatchObject({ gamesPlayed: 2, wins: 1, losses: 1 });
    expect(db.state.activity).toEqual([
      expect.objectContaining({ action: 'standings.award_game', targetId: seasonId }),
    ]);
    expect(db.state.activity[0]?.details).toMatchObject({
      team: teamId(2),
      against: teamId(1),
      reason: input.reason,
    });
  });

  it('takes both halves off together', async () => {
    const { db, deps, as } = memoryStandings({ games });
    await awardGame(as(ownerId), input, deps);
    const first = db.state.adjustments[0]?.id ?? '';
    await removeAdjustment(as(ownerId), { seasonId, adjustmentId: first }, deps);
    expect(row(db.state.rows[seasonId], 1)).toMatchObject({ gamesPlayed: 1, wins: 1, losses: 0 });
    expect(row(db.state.rows[seasonId], 2)).toMatchObject({ gamesPlayed: 1, wins: 0, losses: 1 });
  });

  it('refuses one team against itself, saving nothing', async () => {
    const { db, deps, as } = memoryStandings({ games });
    expect(await awardGame(as(ownerId), { ...input, loserTeamId: teamId(2) }, deps)).toMatchObject({
      error: { code: 'same-team' },
    });
    expect(db.state.adjustments).toEqual([]);
  });
});
