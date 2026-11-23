import { describe, expect, it } from 'vitest';
import {
  game,
  memoryStandings,
  type MemoryStandings,
  ownerId,
  rules,
  schedulerGrant,
  schedulerId,
  seasonId,
  teamId,
} from '../memory-standings.test-helper.ts';
import { listAdjustments } from './list-adjustments.ts';
import { rebuildStandings } from './rebuild-standings.ts';
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

// Five teams; team 1 beats team 2 by ten, so teams 3, 4 and 5 are level at 0-0.
const fiveTeams = [1, 2, 3, 4, 5].map((n) => ({ teamId: teamId(n), divisionId: null, seasonId }));
const won = (n: number, home: number, away: number, homeScore = 60) =>
  game(n, home, away, {
    status: 'final',
    homeScore,
    awayScore: 50,
    finalizedAt: `2026-12-2${n}T20:00:00.000Z`,
  });
const flipApplied = (rows: MemoryStandings['rows'][string] | undefined, n: number) =>
  rowOf(rows, n)?.level?.steps.some((s) => s.tiebreaker === 'coin-flip' && s.applied) ?? false;

describe('a coin flip orders teams only while they are level as the set it names (S-89)', () => {
  it('a tie of three that shrinks to two: the flip orders nobody, is unused, and taking it off changes nothing', async () => {
    const { db, deps, as } = memoryStandings({ teams: fiveTeams, games: [won(1, 1, 2)] });
    const recorded = await recordCoinFlip(
      as(ownerId),
      { seasonId, teamIds: [teamId(5), teamId(4), teamId(3)], method: 'by-hand' },
      deps,
    );
    expect(recorded.ok).toBe(true);
    expect(flipApplied(db.state.rows[seasonId], 5)).toBe(true);

    // Team 3 wins by twenty and pulls clear; 4 and 5 are still level, now as a pair.
    db.state.games.push(won(2, 3, 2, 70));
    expect((await rebuildStandings(as(ownerId), { seasonId }, deps)).ok).toBe(true);
    const rows = db.state.rows[seasonId];
    expect(rowOf(rows, 4)?.rank).toBe(rowOf(rows, 5)?.rank);
    expect(flipApplied(rows, 4) || flipApplied(rows, 5)).toBe(false);
    const listed = await listAdjustments(as(ownerId), { seasonId }, deps);
    if (!listed.ok) throw new Error('listAdjustments failed');
    const pair = listed.value.levelSets.find((set) => set.teamIds.includes(teamId(4)));
    expect(pair?.teamIds).toHaveLength(2);
    expect(pair?.flip).toBeNull();
    expect(listed.value.unusedFlips.map((f) => f.teamIds)).toEqual([
      [teamId(5), teamId(4), teamId(3)],
    ]);

    if (!recorded.ok) return;
    const before = JSON.stringify(db.state.rows[seasonId]);
    const removed = await removeCoinFlip(
      as(ownerId),
      { seasonId, flipId: recorded.value.flipId, reason: 'No longer in use' },
      deps,
    );
    expect(removed.ok).toBe(true);
    expect(JSON.stringify(db.state.rows[seasonId])).toBe(before);
  });

  it('a tie of two that gains a third: the flip orders nobody, and the admin sees three level with no flip', async () => {
    // 1 and 3 win by ten, 2 and 4 lose by ten, 5 has not played: {1, 3} level.
    const { db, deps, as } = memoryStandings({
      teams: fiveTeams,
      games: [won(1, 1, 2), won(2, 3, 4)],
    });
    const recorded = await recordCoinFlip(
      as(ownerId),
      { seasonId, teamIds: [teamId(3), teamId(1)], method: 'by-hand' },
      deps,
    );
    expect(recorded.ok).toBe(true);
    expect(rowOf(db.state.rows[seasonId], 3)?.rank).toBeLessThan(
      rowOf(db.state.rows[seasonId], 1)?.rank ?? 0,
    );

    // Team 5 wins by ten too and joins them.
    db.state.games.push(won(3, 5, 2));
    expect((await rebuildStandings(as(ownerId), { seasonId }, deps)).ok).toBe(true);
    const rows = db.state.rows[seasonId];
    expect(rowOf(rows, 1)?.rank).toBe(rowOf(rows, 3)?.rank);
    expect(rowOf(rows, 5)?.rank).toBe(rowOf(rows, 3)?.rank);
    expect([1, 3, 5].some((n) => flipApplied(rows, n))).toBe(false);
    const listed = await listAdjustments(as(ownerId), { seasonId }, deps);
    if (!listed.ok) throw new Error('listAdjustments failed');
    const three = listed.value.levelSets.find((set) => set.teamIds.includes(teamId(1)));
    expect([...(three?.teamIds ?? [])].sort()).toEqual([teamId(1), teamId(3), teamId(5)]);
    expect(three?.flip).toBeNull();
    expect(listed.value.unusedFlips).toHaveLength(1);
  });
});

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
