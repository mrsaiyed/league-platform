import { describe, expect, it } from 'vitest';
import { memoryLeagues, ownerId, staffId } from '../memory-leagues.test-helper.ts';
import { setCurrentSeason } from './set-current-season.ts';

const id = (n: number) => `01900000-0000-7000-8000-0000000000c${n}`;
const seasons = [
  { id: id(1), programId: 'p1', slug: 'one', isCurrent: true },
  { id: id(2), programId: 'p1', slug: 'two', isCurrent: false },
  { id: id(3), programId: 'p2', slug: 'one', isCurrent: true },
];

describe('setCurrentSeason', () => {
  it('makes one season current and leaves other programs alone (T3 §12)', async () => {
    const { db, deps, as } = memoryLeagues({ seasons });
    expect(await setCurrentSeason(as(ownerId), { seasonId: id(2) }, deps)).toEqual({
      ok: true,
      value: { seasonId: id(2) },
    });
    expect(db.state.seasons.map((s) => s.isCurrent)).toEqual([false, true, true]);
  });

  it('refuses a season that is not there, a bad id, and anyone but the owner', async () => {
    const { db, deps, as } = memoryLeagues({ seasons });
    expect(await setCurrentSeason(as(ownerId), { seasonId: 'nope' }, deps)).toMatchObject({
      error: { code: 'invalid-input' },
    });
    expect(await setCurrentSeason(as(ownerId), { seasonId: id(9) }, deps)).toMatchObject({
      error: { code: 'season-not-found' },
    });
    expect(await setCurrentSeason(as(staffId), { seasonId: id(2) }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(db.state.seasons.map((s) => s.isCurrent)).toEqual([true, false, true]);
  });
});
