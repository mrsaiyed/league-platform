import { describe, expect, it } from 'vitest';
import { memoryLeagues, ownerId, staffId } from '../memory-leagues.test-helper.ts';
import { createSeason } from './create-season.ts';

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
