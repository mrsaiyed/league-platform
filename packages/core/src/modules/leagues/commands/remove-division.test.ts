import { describe, expect, it } from 'vitest';
import { division, divisionId, seasons } from '../division-test-data.test-helper.ts';
import { memoryLeagues, ownerId } from '../memory-leagues.test-helper.ts';
import { removeDivision } from './remove-division.ts';

describe('removeDivision', () => {
  it('moves a division to the bin and keeps its row (A-5)', async () => {
    const { db, deps, as } = memoryLeagues({ seasons, divisions: [division(1)] });
    expect(await removeDivision(as(ownerId), { divisionId: divisionId(1) }, deps)).toEqual({
      ok: true,
      value: { divisionId: divisionId(1) },
    });
    expect(db.state.divisions).toHaveLength(1);
    expect(db.state.divisions[0]?.binned).toBe(true);
    expect(db.state.activity.map((a) => a.action)).toEqual(['leagues.remove_division']);
  });

  it('refuses while a sub-division is not in the bin, and allows it once that one is', async () => {
    const { db, deps, as } = memoryLeagues({
      seasons,
      divisions: [division(1), division(2, { parentDivisionId: divisionId(1) })],
    });
    expect(await removeDivision(as(ownerId), { divisionId: divisionId(1) }, deps)).toEqual({
      ok: false,
      error: { code: 'division-has-subdivisions' },
    });
    expect(db.state.divisions.map((d) => d.binned)).toEqual([false, false]);
    await removeDivision(as(ownerId), { divisionId: divisionId(2) }, deps);
    expect(await removeDivision(as(ownerId), { divisionId: divisionId(1) }, deps)).toMatchObject({
      ok: true,
    });
  });

  it('refuses one already in the bin or missing, and non-admins', async () => {
    const { deps, as } = memoryLeagues({ seasons, divisions: [division(1, { binned: true })] });
    expect(await removeDivision(as(ownerId), { divisionId: divisionId(1) }, deps)).toMatchObject({
      error: { code: 'division-not-found' },
    });
    expect(await removeDivision(as(ownerId), { divisionId: divisionId(9) }, deps)).toMatchObject({
      error: { code: 'division-not-found' },
    });
    expect(await removeDivision(as('someone'), { divisionId: divisionId(1) }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});
