import { describe, expect, it } from 'vitest';
import { memoryLeagues, ownerId, staffId } from '../memory-leagues.test-helper.ts';
import { createSeason } from './create-season.ts';

const programA = '01900000-0000-7000-8000-0000000000d1';
const programB = '01900000-0000-7000-8000-0000000000d2';
const programAdminId = '01900000-0000-7000-8000-0000000000e1';
/** An admin limited to program A (P4 §4). */
const programAdminGrant = {
  id: '01900000-0000-7000-8000-0000000000f1',
  accountId: programAdminId,
  role: 'admin',
  scope: { type: 'program', id: programA },
  grantedByAccountId: ownerId,
  revokedAt: null,
} as const;

describe('createSeason', () => {
  it('adds a season to the default program when none is named (U-3)', async () => {
    const { db, deps, as } = memoryLeagues();
    const result = await createSeason(
      as(ownerId),
      { slug: 'spring-2027', name: 'Spring 2027', startsOn: '2027-03-01', endsOn: '2027-05-30' },
      deps,
    );
    expect(result).toEqual({ ok: true, value: { seasonId: 'season-1' } });
    expect(db.state.seasons).toMatchObject([{ programId: 'program-default', isCurrent: false }]);
  });

  it('refuses an unknown program, a repeated short name, and bad input', async () => {
    const { deps, as } = memoryLeagues();
    const add = (more: object) =>
      createSeason(as(ownerId), { slug: 'spring', name: 'Spring', ...more }, deps);
    expect(await add({ programId: '01900000-0000-7000-8000-0000000000ff' })).toMatchObject({
      error: { code: 'program-not-found' },
    });
    expect(await add({})).toMatchObject({ ok: true });
    expect(await add({})).toMatchObject({ error: { code: 'season-slug-taken' } });
    for (const bad of [
      { slug: 'Not Valid' },
      { startsOn: '2027-05-30', endsOn: '2027-03-01' },
      { startsOn: '2027-13-01' },
    ]) {
      expect(await add(bad)).toMatchObject({ error: { code: 'invalid-input' } });
    }
  });

  it("lets an admin limited to a program add that program's seasons, and no other's (P4 §4)", async () => {
    const programs = [
      { id: 'program-default', slug: 'main', isDefault: true },
      { id: programA, slug: 'youth', isDefault: false },
      { id: programB, slug: 'adult', isDefault: false },
    ];
    const { db, deps, as } = memoryLeagues({ programs, grants: [programAdminGrant] });
    const add = (programId?: string) =>
      createSeason(as(programAdminId), { programId, slug: 'fall', name: 'Fall' }, deps);
    expect(await add(programA)).toMatchObject({ ok: true });
    for (const other of [programB, undefined]) {
      expect(await add(other)).toEqual({ ok: false, error: { code: 'not-allowed' } });
    }
    expect(db.state.seasons.map((s) => s.programId)).toEqual([programA]);
  });

  it('refuses even that admin while the league is archived or suspended (U-9)', async () => {
    for (const status of ['archived', 'suspended'] as const) {
      const programs = [{ id: programA, slug: 'youth', isDefault: false }];
      const { db, deps, as } = memoryLeagues({ programs, grants: [programAdminGrant] });
      if (db.state.league !== undefined) db.state.league = { ...db.state.league, status };
      expect(
        await createSeason(as(programAdminId), { programId: programA, slug: 'f', name: 'F' }, deps),
      ).toEqual({ ok: false, error: { code: 'not-allowed' } });
    }
  });

  it('is for the owner only', async () => {
    const { db, deps, as } = memoryLeagues();
    for (const account of [staffId, null]) {
      expect(await createSeason(as(account), { slug: 'spring', name: 'Spring' }, deps)).toEqual({
        ok: false,
        error: { code: 'not-allowed' },
      });
    }
    expect(db.state.seasons).toEqual([]);
  });
});
