import { describe, expect, it } from 'vitest';
import {
  game,
  memoryStandings,
  ownerId,
  rules,
  schedulerGrant,
  schedulerId,
  seasonId,
  teamId,
} from '../memory-standings.test-helper.ts';
import { listAdjustments } from './list-adjustments.ts';
import { recordCoinFlip } from './record-coin-flip.ts';
import { removeCoinFlip } from './remove-coin-flip.ts';

// Team 1 beats team 2; teams 3 and 4 have played nobody, so they are level after every
// tiebreaker and share a place.
const decided = game(1, 1, 2, {
  status: 'final',
  homeScore: 60,
  awayScore: 50,
  finalizedAt: '2026-12-20T20:00:00.000Z',
});
const level = [teamId(3), teamId(4)];
const rowOf = <R extends { teamId: string }>(rows: readonly R[] | undefined, n: number) =>
  rows?.find((r) => r.teamId === teamId(n));

describe('recordCoinFlip', () => {
  it('lists the level teams, then orders them by the flip, and logs it', async () => {
    const { db, deps, as } = memoryStandings({ games: [decided] });
    const before = await listAdjustments(as(ownerId), { seasonId }, deps);
    expect(before.ok && before.value.levelSets).toEqual([{ teamIds: level, flip: null }]);

    const flip = [teamId(4), teamId(3)];
    const result = await recordCoinFlip(
      as(ownerId),
      { seasonId, teamIds: flip, method: 'by-hand', note: 'Flipped by the referee' },
      deps,
    );
    expect(result.ok).toBe(true);
    const rows = db.state.rows[seasonId];
    expect(rowOf(rows, 4)?.rank).toBeLessThan(rowOf(rows, 3)?.rank ?? 0);
    expect(db.state.activity).toEqual([
      expect.objectContaining({ action: 'standings.record_coin_flip', targetId: seasonId }),
    ]);
    expect(db.state.activity[0]?.details).toMatchObject({
      teams: flip.join(','),
      method: 'by-hand',
      note: 'Flipped by the referee',
    });
    const after = await listAdjustments(as(ownerId), { seasonId }, deps);
    expect(after.ok && after.value.levelSets[0]?.flip?.teamIds).toEqual(flip);
    expect(after.ok && after.value.unusedFlips).toEqual([]);
  });

  it('applies even when the season lists no coin flip, and the level note says a flip did it', async () => {
    const { db, deps, as } = memoryStandings({
      games: [decided],
      seasons: [
        {
          id: seasonId,
          programId: 'p',
          rules: rules((r) => (r.tiebreakers = ['point-difference'])),
        },
      ],
    });
    const result = await recordCoinFlip(
      as(ownerId),
      { seasonId, teamIds: [teamId(4), teamId(3)], method: 'drawn' },
      deps,
    );
    expect(result.ok).toBe(true);
    const row = rowOf(db.state.rows[seasonId], 4);
    expect(row?.level?.steps.at(-1)).toMatchObject({ tiebreaker: 'coin-flip', applied: true });
  });

  it('changing the order sends the earlier flip to the bin; taking it off makes them level again', async () => {
    const { db, deps, as } = memoryStandings({ games: [decided] });
    const first = await recordCoinFlip(
      as(ownerId),
      { seasonId, teamIds: level, method: 'by-hand' },
      deps,
    );
    const second = await recordCoinFlip(
      as(ownerId),
      { seasonId, teamIds: [teamId(4), teamId(3)], method: 'by-hand' },
      deps,
    );
    expect(first.ok && second.ok).toBe(true);
    expect(db.state.coinFlips?.map((f) => f.binned === true)).toEqual([true, false]);
    if (!second.ok) return;
    const removed = await removeCoinFlip(
      as(ownerId),
      { seasonId, flipId: second.value.flipId, reason: 'Flipped again' },
      deps,
    );
    expect(removed.ok).toBe(true);
    const rows = db.state.rows[seasonId];
    expect(rowOf(rows, 3)?.rank).toBe(rowOf(rows, 4)?.rank);
    expect(db.state.activity.at(-1)).toMatchObject({
      action: 'standings.remove_coin_flip',
      details: { flip: second.value.flipId, reason: 'Flipped again' },
    });
    const again = await removeCoinFlip(
      as(ownerId),
      { seasonId, flipId: second.value.flipId },
      deps,
    );
    expect(again).toEqual({ ok: false, error: { code: 'flip-not-found' } });
  });

  it('refuses teams that are not level after every tiebreaker, saving nothing', async () => {
    const { db, deps, as } = memoryStandings({ games: [decided] });
    const result = await recordCoinFlip(
      as(ownerId),
      { seasonId, teamIds: [teamId(1), teamId(2)], method: 'by-hand' },
      deps,
    );
    expect(result).toEqual({ ok: false, error: { code: 'teams-not-level' } });
    expect(db.state.coinFlips ?? []).toEqual([]);
  });

  it('is only for someone who may adjust the standings', async () => {
    const { deps, as } = memoryStandings({ games: [decided], grants: [schedulerGrant] });
    const result = await recordCoinFlip(
      as(schedulerId),
      { seasonId, teamIds: level, method: 'by-hand' },
      deps,
    );
    expect(result.ok).toBe(false);
  });
});
