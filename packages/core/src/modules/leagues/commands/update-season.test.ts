import { describe, expect, it } from 'vitest';
import { memoryLeagues, ownerId, staffId } from '../memory-leagues.test-helper.ts';
import { updateSeason } from './update-season.ts';

const id = (n: number) => `01900000-0000-7000-8000-0000000000c${n}`;
const seasons = [
  { id: id(1), programId: 'program-default', slug: 'one', isCurrent: true, name: 'One' },
  { id: id(2), programId: 'program-default', slug: 'two', isCurrent: false, name: 'Two' },
];

describe('updateSeason', () => {
  it('saves a name, dates, state and current mark, and logs it', async () => {
    const { db, deps, as } = memoryLeagues({ seasons });
    const result = await updateSeason(
      as(ownerId),
      {
        seasonId: id(2),
        version: 1,
        name: ' Winter ',
        startsOn: '2027-01-05',
        endsOn: '2027-03-01',
        status: 'active',
        current: true,
      },
      deps,
    );
    expect(result).toEqual({ ok: true, value: { version: 2 } });
    expect(db.state.seasons[1]).toMatchObject({
      name: 'Winter',
      startsOn: '2027-01-05',
      status: 'active',
      isCurrent: true,
    });
    expect(db.state.seasons[0]?.isCurrent).toBe(false);
    expect(db.state.activity.map((a) => a.action)).toEqual(['leagues.update_season']);
    // The log says it is now shown to visitors (step 2.77).
    expect(db.state.activity[0]?.details).toMatchObject({ status: 'active' });
  });

  it('gives a version conflict to the second of two admins saving the same season (A-8)', async () => {
    const { db, deps, as } = memoryLeagues({ seasons });
    const first = await updateSeason(as(ownerId), { seasonId: id(1), version: 1, name: 'A' }, deps);
    const second = await updateSeason(
      as(ownerId),
      { seasonId: id(1), version: 1, name: 'B' },
      deps,
    );
    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: false, error: { code: 'changed-since-read' } });
    expect(db.state.seasons[0]?.name).toBe('A');
  });

  it('refuses dates out of order, a missing season, no change and anyone but an admin', async () => {
    const { deps, as } = memoryLeagues({ seasons });
    const code = async (who: string, input: object) => {
      const r = await updateSeason(as(who), input, deps);
      return r.ok ? 'ok' : r.error.code;
    };
    expect(
      await code(ownerId, {
        seasonId: id(1),
        version: 1,
        startsOn: '2027-02-01',
        endsOn: '2027-01-01',
      }),
    ).toBe('season-dates-out-of-order');
    expect(await code(ownerId, { seasonId: id(9), version: 1, name: 'X' })).toBe(
      'season-not-found',
    );
    expect(await code(ownerId, { seasonId: id(1), version: 1 })).toBe('invalid-input');
    expect(await code(ownerId, { seasonId: id(1), version: 1, status: 'over' })).toBe(
      'invalid-input',
    );
    expect(await code(staffId, { seasonId: id(1), version: 1, name: 'X' })).toBe('not-allowed');
  });

  it('refuses a scheduler and a scorekeeper showing a season (A-18, step 2.182)', async () => {
    const grantOf = (accountId: string, role: 'scheduler' | 'scorekeeper', n: number) =>
      ({
        id: `01900000-0000-7000-8000-0000000000f${n}`,
        accountId,
        role,
        scope: { type: 'league' },
        grantedByAccountId: ownerId,
        revokedAt: null,
      }) as const;
    const scheduler = '01900000-0000-7000-8000-0000000000d1';
    const scorekeeper = '01900000-0000-7000-8000-0000000000d2';
    const { db, deps, as } = memoryLeagues({
      seasons: seasons.map((s) => ({ ...s, status: 'draft' as const })),
      grants: [grantOf(scheduler, 'scheduler', 1), grantOf(scorekeeper, 'scorekeeper', 2)],
    });
    for (const who of [scheduler, scorekeeper]) {
      expect(
        await updateSeason(as(who), { seasonId: id(2), version: 1, status: 'active' }, deps),
      ).toEqual({ ok: false, error: { code: 'not-allowed' } });
    }
    expect(db.state.seasons[1]?.status).toBe('draft');
    expect(db.state.activity).toEqual([]);
    // The owner shows it and hides it again.
    expect(
      await updateSeason(as(ownerId), { seasonId: id(2), version: 1, status: 'active' }, deps),
    ).toEqual({ ok: true, value: { version: 2 } });
    expect(
      await updateSeason(as(ownerId), { seasonId: id(2), version: 2, status: 'draft' }, deps),
    ).toEqual({ ok: true, value: { version: 3 } });
    expect(db.state.seasons[1]?.status).toBe('draft');
  });

  it('changes nothing and logs nothing when nothing differs', async () => {
    const { db, deps, as } = memoryLeagues({ seasons });
    expect(
      await updateSeason(as(ownerId), { seasonId: id(1), version: 1, name: 'One' }, deps),
    ).toEqual({ ok: true, value: { version: 1 } });
    expect(db.state.activity).toEqual([]);
  });
});
