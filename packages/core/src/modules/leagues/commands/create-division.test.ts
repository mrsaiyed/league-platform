import { describe, expect, it } from 'vitest';
import {
  division,
  divisionId,
  otherSeasonId,
  programAdminGrant,
  programAdminId,
  seasonId,
  seasons,
} from '../division-test-data.test-helper.ts';
import { memoryLeagues, ownerId } from '../memory-leagues.test-helper.ts';
import { createDivision } from './create-division.ts';

describe('createDivision', () => {
  it('adds a division last among its siblings, with a lower-case color', async () => {
    const { db, deps, as } = memoryLeagues({ seasons, divisions: [division(1), division(2)] });
    const result = await createDivision(
      as(ownerId),
      { seasonId, name: ' Gold ', color: '#C8A84B' },
      deps,
    );
    expect(result).toMatchObject({ ok: true });
    expect(db.state.divisions[2]).toMatchObject({
      name: 'Gold',
      color: '#c8a84b',
      sort: 3,
      parentDivisionId: null,
    });
    expect(db.state.activity.map((a) => a.action)).toEqual(['leagues.create_division']);
  });

  it('puts a division under another one of the same season (U-12)', async () => {
    const { db, deps, as } = memoryLeagues({ seasons, divisions: [division(1)] });
    await createDivision(
      as(ownerId),
      { seasonId, parentDivisionId: divisionId(1), name: 'East' },
      deps,
    );
    expect(db.state.divisions[1]?.parentDivisionId).toBe(divisionId(1));
  });

  it('refuses a parent that is in the bin, in another season or missing', async () => {
    const { deps, as } = memoryLeagues({
      seasons,
      divisions: [division(1, { binned: true }), division(2, { seasonId: otherSeasonId })],
    });
    for (const parentDivisionId of [divisionId(1), divisionId(2), divisionId(9)]) {
      expect(
        await createDivision(as(ownerId), { seasonId, parentDivisionId, name: 'East' }, deps),
      ).toEqual({ ok: false, error: { code: 'parent-not-found' } });
    }
  });

  it('refuses a name a sibling has, whatever the capitals, but not one in the bin', async () => {
    const { deps, as } = memoryLeagues({
      seasons,
      divisions: [division(1, { name: 'Gold' }), division(2, { name: 'Old', binned: true })],
    });
    expect(await createDivision(as(ownerId), { seasonId, name: 'GOLD' }, deps)).toEqual({
      ok: false,
      error: { code: 'division-name-taken' },
    });
    expect(await createDivision(as(ownerId), { seasonId, name: 'old' }, deps)).toMatchObject({
      ok: true,
    });
  });

  it('refuses a season that is not there, and bad input', async () => {
    const { deps, as } = memoryLeagues({ seasons });
    expect(await createDivision(as(ownerId), { seasonId: divisionId(5), name: 'X' }, deps)).toEqual(
      { ok: false, error: { code: 'season-not-found' } },
    );
    for (const input of [
      { seasonId, name: '  ' },
      { seasonId, name: 'X', color: 'gold' },
    ]) {
      expect(await createDivision(as(ownerId), input, deps)).toMatchObject({
        error: { code: 'invalid-input' },
      });
    }
  });

  it("lets a program's admin manage that program's seasons only, and nobody else (P4 §4)", async () => {
    const { deps, as } = memoryLeagues({ seasons, grants: [programAdminGrant] });
    expect(await createDivision(as(programAdminId), { seasonId, name: 'A' }, deps)).toMatchObject({
      ok: true,
    });
    expect(
      await createDivision(as(programAdminId), { seasonId: otherSeasonId, name: 'A' }, deps),
    ).toMatchObject({ error: { code: 'not-allowed' } });
    expect(await createDivision(as('someone'), { seasonId, name: 'A' }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(await createDivision(as(null), { seasonId, name: 'A' }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });

  it('refuses while the league is archived or suspended (U-9)', async () => {
    for (const status of ['archived', 'suspended'] as const) {
      const { db, deps, as } = memoryLeagues({ seasons });
      if (db.state.league !== undefined) db.state.league = { ...db.state.league, status };
      expect(await createDivision(as(ownerId), { seasonId, name: 'A' }, deps)).toMatchObject({
        error: { code: 'not-allowed' },
      });
    }
  });
});
