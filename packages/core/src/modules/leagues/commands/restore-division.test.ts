import { describe, expect, it } from 'vitest';
import { division, divisionId, seasons } from '../division-test-data.test-helper.ts';
import { memoryLeagues, ownerId } from '../memory-leagues.test-helper.ts';
import { restoreDivision } from './restore-division.ts';

describe('restoreDivision', () => {
  it('brings a division back from the bin', async () => {
    const { db, deps, as } = memoryLeagues({ seasons, divisions: [division(1, { binned: true })] });
    expect(await restoreDivision(as(ownerId), { divisionId: divisionId(1) }, deps)).toMatchObject({
      ok: true,
    });
    expect(db.state.divisions[0]?.binned).toBe(false);
    expect(db.state.activity.map((a) => a.action)).toEqual(['leagues.restore_division']);
  });

  it('says plainly when a sibling took its name since, and leaves it in the bin', async () => {
    const { db, deps, as } = memoryLeagues({
      seasons,
      divisions: [division(1, { name: 'Gold', binned: true }), division(2, { name: 'gold' })],
    });
    expect(await restoreDivision(as(ownerId), { divisionId: divisionId(1) }, deps)).toEqual({
      ok: false,
      error: { code: 'division-name-taken' },
    });
    expect(db.state.divisions[0]?.binned).toBe(true);
  });

  it('keeps a sub-division in the bin while its parent is there', async () => {
    const { deps, as } = memoryLeagues({
      seasons,
      divisions: [
        division(1, { binned: true }),
        division(2, { parentDivisionId: divisionId(1), binned: true }),
      ],
    });
    expect(await restoreDivision(as(ownerId), { divisionId: divisionId(2) }, deps)).toEqual({
      ok: false,
      error: { code: 'division-parent-in-bin' },
    });
    await restoreDivision(as(ownerId), { divisionId: divisionId(1) }, deps);
    expect(await restoreDivision(as(ownerId), { divisionId: divisionId(2) }, deps)).toMatchObject({
      ok: true,
    });
  });

  it('does nothing for one not in the bin, and refuses a missing one and non-admins', async () => {
    const { db, deps, as } = memoryLeagues({ seasons, divisions: [division(1)] });
    expect(await restoreDivision(as(ownerId), { divisionId: divisionId(1) }, deps)).toMatchObject({
      ok: true,
    });
    expect(db.state.activity).toEqual([]);
    expect(await restoreDivision(as(ownerId), { divisionId: divisionId(9) }, deps)).toMatchObject({
      error: { code: 'division-not-found' },
    });
    expect(await restoreDivision(as('someone'), { divisionId: divisionId(1) }, deps)).toMatchObject(
      { error: { code: 'not-allowed' } },
    );
  });
});
