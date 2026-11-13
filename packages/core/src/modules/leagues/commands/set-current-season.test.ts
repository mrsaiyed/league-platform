import { describe, expect, it } from 'vitest';
import { memoryLeagues, ownerId, staffId } from '../memory-leagues.test-helper.ts';
import { setCurrentSeason } from './set-current-season.ts';

const id = (n: number) => `01900000-0000-7000-8000-0000000000c${n}`;
const programAdminId = '01900000-0000-7000-8000-0000000000e1';
/** An admin limited to program p1 (P4 §4). */
const programAdminGrant = {
  id: '01900000-0000-7000-8000-0000000000f1',
  accountId: programAdminId,
  role: 'admin',
  scope: { type: 'program', id: 'p1' },
  grantedByAccountId: ownerId,
  revokedAt: null,
} as const;
const seasons = [
  { id: id(1), programId: 'p1', slug: 'one', isCurrent: true },
  { id: id(2), programId: 'p1', slug: 'two', isCurrent: false },
  { id: id(3), programId: 'p2', slug: 'one', isCurrent: true },
];

describe('setCurrentSeason', () => {
  it('makes one season current and leaves other programs alone (T3 §12)', async () => {
    const { db, deps, as } = memoryLeagues({ seasons });
    expect(await setCurrentSeason(as(ownerId), { seasonId: id(2), version: 1 }, deps)).toEqual({
      ok: true,
      value: { seasonId: id(2), version: 2 },
    });
    expect(db.state.seasons.map((s) => s.isCurrent)).toEqual([false, true, true]);
  });

  it('refuses a season that changed since it was read, and one already current is left alone', async () => {
    const { db, deps, as } = memoryLeagues({ seasons });
    expect(await setCurrentSeason(as(ownerId), { seasonId: id(2), version: 4 }, deps)).toEqual({
      ok: false,
      error: { code: 'changed-since-read' },
    });
    expect(db.state.seasons.map((s) => s.isCurrent)).toEqual([true, false, true]);
    expect(await setCurrentSeason(as(ownerId), { seasonId: id(1), version: 1 }, deps)).toEqual({
      ok: true,
      value: { seasonId: id(1), version: 1 },
    });
  });

  it('refuses a season that is not there, a bad id, and anyone but the owner', async () => {
    const { db, deps, as } = memoryLeagues({ seasons });
    expect(
      await setCurrentSeason(as(ownerId), { seasonId: 'nope', version: 1 }, deps),
    ).toMatchObject({
      error: { code: 'invalid-input' },
    });
    expect(
      await setCurrentSeason(as(ownerId), { seasonId: id(9), version: 1 }, deps),
    ).toMatchObject({
      error: { code: 'season-not-found' },
    });
    expect(
      await setCurrentSeason(as(staffId), { seasonId: id(2), version: 1 }, deps),
    ).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(db.state.seasons.map((s) => s.isCurrent)).toEqual([true, false, true]);
  });

  it("lets an admin limited to a program choose that program's season, and no other's (P4 §4)", async () => {
    const { db, deps, as } = memoryLeagues({ seasons, grants: [programAdminGrant] });
    expect(
      await setCurrentSeason(as(programAdminId), { seasonId: id(2), version: 1 }, deps),
    ).toMatchObject({
      ok: true,
    });
    expect(
      await setCurrentSeason(as(programAdminId), { seasonId: id(3), version: 1 }, deps),
    ).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
    expect(db.state.seasons.map((s) => s.isCurrent)).toEqual([false, true, true]);
  });

  it('refuses even that admin while the league is archived or suspended (U-9)', async () => {
    for (const status of ['archived', 'suspended'] as const) {
      const { db, deps, as } = memoryLeagues({ seasons, grants: [programAdminGrant] });
      if (db.state.league !== undefined) db.state.league = { ...db.state.league, status };
      expect(
        await setCurrentSeason(as(programAdminId), { seasonId: id(2), version: 1 }, deps),
      ).toEqual({
        ok: false,
        error: { code: 'not-allowed' },
      });
    }
  });
});
