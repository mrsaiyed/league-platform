import { describe, expect, it } from 'vitest';
import {
  adminOfOtherProgramId,
  game,
  memoryStandings,
  otherProgramAdminGrant,
  ownerId,
  rules,
  schedulerGrant,
  schedulerId,
  seasonId,
  teamId,
} from '../memory-standings.test-helper.ts';
import { addAdjustment } from './add-adjustment.ts';
import { removeAdjustment } from './remove-adjustment.ts';

const decided = game(1, 1, 2, {
  status: 'final',
  homeScore: 60,
  awayScore: 50,
  finalizedAt: '2026-12-20T20:00:00.000Z',
});
const input = {
  seasonId,
  teamId: teamId(2),
  wins: 1,
  losses: -1,
  reason: 'Ruling: protest upheld',
};

describe('addAdjustment', () => {
  it('saves it, works the standings out again with it, and logs it', async () => {
    const { db, deps, as } = memoryStandings({ games: [decided] });
    const result = await addAdjustment(as(ownerId), input, deps);
    expect(result.ok).toBe(true);
    expect(db.state.adjustments).toEqual([
      expect.objectContaining({ teamId: teamId(2), wins: 1, losses: -1, points: 0, seasonId }),
    ]);
    const row = db.state.rows[seasonId]?.find((r) => r.teamId === teamId(2));
    expect(row).toMatchObject({ wins: 1, losses: 0 });
    expect(row?.adjustments).toEqual([
      { adjustmentId: db.state.adjustments[0]?.id, reason: 'Ruling: protest upheld' },
    ]);
    expect(db.state.activity).toEqual([
      expect.objectContaining({ action: 'standings.add_adjustment', targetId: seasonId }),
    ]);
  });

  it('refuses one the calculation would leave out, saving nothing', async () => {
    const { db, deps, as } = memoryStandings({ games: [decided] });
    // Takes a win away from a team with none.
    expect(await addAdjustment(as(ownerId), { ...input, wins: -1, losses: 0 }, deps)).toMatchObject(
      {
        error: { code: 'adjustment-not-counted', reason: 'adjustment-makes-count-negative' },
      },
    );
    // Standings points mean nothing while the season ranks by win percentage.
    expect(
      await addAdjustment(as(ownerId), { ...input, wins: 0, losses: 0, points: -2 }, deps),
    ).toMatchObject({ error: { code: 'adjustment-not-counted' } });
    expect(db.state.adjustments).toEqual([]);
    expect(db.state.rows).toEqual({});
    expect(db.state.activity).toEqual([]);
  });

  it('counts a points deduction in a season ranked by points', async () => {
    const { db, deps, as } = memoryStandings({
      games: [decided],
      seasons: [
        {
          id: seasonId,
          programId: 'p1',
          rules: rules((r) => {
            r.standings.rankBy = 'points';
            r.standings.columns = [...r.standings.columns, 'points'];
          }),
        },
      ],
    });
    const result = await addAdjustment(
      as(ownerId),
      { seasonId, teamId: teamId(1), points: -2, reason: 'Late to the game' },
      deps,
    );
    expect(result).toMatchObject({ ok: true });
    expect(db.state.rows[seasonId]?.find((r) => r.teamId === teamId(1))?.points).toBe(0);
  });

  it('refuses bad input, a missing season or team, and anyone without standings.adjust', async () => {
    const { db, deps, as } = memoryStandings({
      grants: [schedulerGrant, otherProgramAdminGrant],
    });
    const bad = [
      { ...input, reason: '   ' },
      { ...input, wins: 0, losses: 0 },
      { ...input, wins: 1.5 },
      { ...input, teamId: 'nope' },
    ];
    for (const one of bad) {
      expect(await addAdjustment(as(ownerId), one, deps)).toMatchObject({
        error: { code: 'invalid-input' },
      });
    }
    expect(await addAdjustment(as(ownerId), { ...input, seasonId: teamId(77) }, deps)).toEqual({
      ok: false,
      error: { code: 'season-not-found' },
    });
    expect(await addAdjustment(as(ownerId), { ...input, teamId: teamId(77) }, deps)).toEqual({
      ok: false,
      error: { code: 'team-not-found' },
    });
    for (const who of [schedulerId, adminOfOtherProgramId, null]) {
      expect(await addAdjustment(as(who), input, deps)).toMatchObject({
        error: { code: 'not-allowed' },
      });
    }
    expect(db.state.adjustments).toEqual([]);
  });
});

describe('removeAdjustment', () => {
  it('bins it, works the standings out again without it, and logs it', async () => {
    const { db, deps, as } = memoryStandings({ games: [decided] });
    const added = await addAdjustment(as(ownerId), input, deps);
    if (!added.ok) throw new Error('not added');
    const { adjustmentId } = added.value;
    expect(await removeAdjustment(as(ownerId), { seasonId, adjustmentId }, deps)).toEqual({
      ok: true,
      value: {},
    });
    const row = db.state.rows[seasonId]?.find((r) => r.teamId === teamId(2));
    expect(row).toMatchObject({ wins: 0, losses: 1, adjustments: [] });
    expect(db.state.activity.map((a) => a.action)).toEqual([
      'standings.add_adjustment',
      'standings.remove_adjustment',
    ]);
    // Already gone.
    expect(await removeAdjustment(as(ownerId), { seasonId, adjustmentId }, deps)).toEqual({
      ok: false,
      error: { code: 'adjustment-not-found' },
    });
  });

  it("refuses a missing season, another season's adjustment and non-admins", async () => {
    const { deps, as } = memoryStandings({ games: [decided], grants: [schedulerGrant] });
    const added = await addAdjustment(as(ownerId), input, deps);
    if (!added.ok) throw new Error('not added');
    const { adjustmentId } = added.value;
    expect(
      await removeAdjustment(as(ownerId), { seasonId: teamId(77), adjustmentId }, deps),
    ).toEqual({ ok: false, error: { code: 'season-not-found' } });
    expect(
      await removeAdjustment(
        as(ownerId),
        { seasonId: '01900000-0000-7000-8000-0000000000c2', adjustmentId },
        deps,
      ),
    ).toEqual({ ok: false, error: { code: 'adjustment-not-found' } });
    expect(await removeAdjustment(as(schedulerId), { seasonId, adjustmentId }, deps)).toMatchObject(
      { error: { code: 'not-allowed' } },
    );
  });
});
