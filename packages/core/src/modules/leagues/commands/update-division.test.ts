import { describe, expect, it } from 'vitest';
import { division, divisionId, seasons } from '../division-test-data.test-helper.ts';
import { memoryLeagues, ownerId } from '../memory-leagues.test-helper.ts';
import { updateDivision } from './update-division.ts';

const setUp = () =>
  memoryLeagues({
    seasons,
    divisions: [division(1, { name: 'Gold' }), division(2, { name: 'Silver' })],
  });

describe('updateDivision', () => {
  it('renames and colors a division, and logs it', async () => {
    const { db, deps, as } = setUp();
    const result = await updateDivision(
      as(ownerId),
      { divisionId: divisionId(1), version: 1, name: ' Platinum ', color: '#AABBCC' },
      deps,
    );
    expect(result).toEqual({ ok: true, value: { version: 2 } });
    expect(db.state.divisions[0]).toMatchObject({ name: 'Platinum', color: '#aabbcc' });
    expect(db.state.activity.map((a) => a.action)).toEqual(['leagues.update_division']);
  });

  it("clears the color with null, back to the league's own", async () => {
    const { db, deps, as } = memoryLeagues({
      seasons,
      divisions: [division(1, { color: '#aabbcc' })],
    });
    await updateDivision(as(ownerId), { divisionId: divisionId(1), version: 1, color: null }, deps);
    expect(db.state.divisions[0]?.color).toBeNull();
  });

  it('changes nothing and logs nothing when nothing differs', async () => {
    const { db, deps, as } = setUp();
    expect(
      await updateDivision(
        as(ownerId),
        { divisionId: divisionId(1), version: 1, name: 'Gold' },
        deps,
      ),
    ).toEqual({ ok: true, value: { version: 1 } });
    expect(db.state.activity).toEqual([]);
  });

  it('refuses a stale version (T-46), a taken name, a binned division and a missing one', async () => {
    const { db, deps, as } = memoryLeagues({
      seasons,
      divisions: [
        division(1, { name: 'Gold' }),
        division(2, { name: 'Silver' }),
        division(3, { binned: true }),
      ],
    });
    const codeOf = async (input: object) => {
      const result = await updateDivision(as(ownerId), input, deps);
      return result.ok ? 'ok' : result.error.code;
    };
    expect(await codeOf({ divisionId: divisionId(1), version: 4, name: 'X' })).toBe(
      'changed-since-read',
    );
    expect(await codeOf({ divisionId: divisionId(1), version: 1, name: 'silver' })).toBe(
      'division-name-taken',
    );
    expect(await codeOf({ divisionId: divisionId(3), version: 1, name: 'X' })).toBe(
      'division-not-found',
    );
    expect(await codeOf({ divisionId: divisionId(9), version: 1, name: 'X' })).toBe(
      'division-not-found',
    );
    expect(db.state.divisions[0]?.name).toBe('Gold');
  });

  it('needs a change, and refuses anyone but an admin', async () => {
    const { deps, as } = setUp();
    expect(
      await updateDivision(as(ownerId), { divisionId: divisionId(1), version: 1 }, deps),
    ).toMatchObject({ error: { code: 'invalid-input' } });
    expect(
      await updateDivision(
        as('someone'),
        { divisionId: divisionId(1), version: 1, name: 'X' },
        deps,
      ),
    ).toMatchObject({ error: { code: 'not-allowed' } });
  });
});
