import { describe, expect, it } from 'vitest';
import {
  division,
  divisionId,
  otherSeasonId,
  seasonId,
  seasons,
} from '../division-test-data.test-helper.ts';
import { memoryLeagues, ownerId } from '../memory-leagues.test-helper.ts';
import { reorderDivisions } from './reorder-divisions.ts';

describe('reorderDivisions', () => {
  it('gives the divisions the places in the order given', async () => {
    const { db, deps, as } = memoryLeagues({
      seasons,
      divisions: [division(1), division(2), division(3)],
    });
    const ids = [divisionId(3), divisionId(1), divisionId(2)];
    expect(await reorderDivisions(as(ownerId), { seasonId, divisionIds: ids }, deps)).toEqual({
      ok: true,
      value: { count: 3 },
    });
    expect(db.state.divisions.map((d) => d.sort)).toEqual([1, 2, 0]);
    expect(db.state.activity.map((a) => a.action)).toEqual(['leagues.reorder_divisions']);
  });

  it('refuses a list that leaves out a sibling, and leaves a division already in place alone', async () => {
    const { db, deps, as } = memoryLeagues({
      seasons,
      divisions: [division(1, { sort: 0 }), division(2, { sort: 1 }), division(3, { sort: 5 })],
    });
    expect(
      await reorderDivisions(
        as(ownerId),
        { seasonId, divisionIds: [divisionId(2), divisionId(1)] },
        deps,
      ),
    ).toEqual({ ok: false, error: { code: 'divisions-incomplete' } });
    expect(db.state.divisions.map((d) => d.sort)).toEqual([0, 1, 5]);
    await reorderDivisions(
      as(ownerId),
      { seasonId, divisionIds: [divisionId(1), divisionId(2), divisionId(3)] },
      deps,
    );
    expect(db.state.divisions.map((d) => [d.sort, d.version])).toEqual([
      [0, 1],
      [1, 1],
      [2, 2],
    ]);
    expect(db.state.activity[0]?.details).toEqual({ seasonId, count: 3, moved: 1 });
  });

  it('refuses a division of another season, in the bin, under another parent, or missing', async () => {
    const { db, deps, as } = memoryLeagues({
      seasons,
      divisions: [
        division(1),
        division(2, { seasonId: otherSeasonId }),
        division(3, { binned: true }),
        division(4, { parentDivisionId: divisionId(1) }),
      ],
    });
    for (const n of [2, 3, 4, 9]) {
      expect(
        await reorderDivisions(
          as(ownerId),
          { seasonId, divisionIds: [divisionId(1), divisionId(n)] },
          deps,
        ),
      ).toEqual({ ok: false, error: { code: 'division-not-found' } });
    }
    expect(db.state.divisions.map((d) => d.sort)).toEqual([1, 2, 3, 4]);
  });

  it('orders the sub-divisions of one parent, and refuses repeats and non-admins', async () => {
    const { db, deps, as } = memoryLeagues({
      seasons,
      divisions: [
        division(1),
        division(2, { parentDivisionId: divisionId(1) }),
        division(3, { parentDivisionId: divisionId(1) }),
      ],
    });
    await reorderDivisions(
      as(ownerId),
      { seasonId, parentDivisionId: divisionId(1), divisionIds: [divisionId(3), divisionId(2)] },
      deps,
    );
    expect(db.state.divisions.map((d) => d.sort)).toEqual([1, 1, 0]);
    expect(
      await reorderDivisions(
        as(ownerId),
        { seasonId, divisionIds: [divisionId(1), divisionId(1)] },
        deps,
      ),
    ).toMatchObject({ error: { code: 'invalid-input' } });
    expect(
      await reorderDivisions(as('someone'), { seasonId, divisionIds: [divisionId(1)] }, deps),
    ).toMatchObject({ error: { code: 'not-allowed' } });
  });
});
