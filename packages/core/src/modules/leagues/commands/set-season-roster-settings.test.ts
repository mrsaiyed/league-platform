import { describe, expect, it } from 'vitest';
import { memoryLeagues, ownerId, staffId } from '../memory-leagues.test-helper.ts';
import { setSeasonRosterSettings } from './set-season-roster-settings.ts';

const id = (n: number) => `01900000-0000-7000-8000-0000000000c${n}`;
const season = { id: id(1), programId: 'program-default', slug: 'one', isCurrent: true };

describe('setSeasonRosterSettings', () => {
  it('sets roster limits and the unique-jersey switch, keeping the other rules', async () => {
    const { db, deps, as } = memoryLeagues({ seasons: [season] });
    const result = await setSeasonRosterSettings(
      as(ownerId),
      {
        seasonId: id(1),
        version: 1,
        minSize: 5,
        maxSize: 12,
        uniqueJerseys: true,
        locksOn: '2027-02-01',
      },
      deps,
    );
    expect(result).toEqual({ ok: true, value: { version: 2 } });
    expect(db.state.seasons[0]?.rules).toMatchObject({
      version: 1,
      allowTies: false,
      rosters: { minSize: 5, maxSize: 12, locksOn: '2027-02-01', uniqueJerseys: true },
    });
    expect(db.state.activity.map((a) => a.action)).toEqual(['leagues.set_season_roster_settings']);
  });

  it('leaves a field out as it was and clears a limit with null', async () => {
    const { db, deps, as } = memoryLeagues({ seasons: [season] });
    await setSeasonRosterSettings(as(ownerId), { seasonId: id(1), version: 1, maxSize: 10 }, deps);
    await setSeasonRosterSettings(
      as(ownerId),
      { seasonId: id(1), version: 2, minSize: 4, maxSize: null },
      deps,
    );
    expect(db.state.seasons[0]?.rules).toMatchObject({ rosters: { minSize: 4, maxSize: null } });
  });

  it('refuses settings that make no sense, saving nothing', async () => {
    const { db, deps, as } = memoryLeagues({ seasons: [season] });
    for (const input of [{ minSize: 9, maxSize: 5 }, { locksOn: '2027-02-30' }, { maxSize: 0 }]) {
      const result = await setSeasonRosterSettings(
        as(ownerId),
        { seasonId: id(1), version: 1, ...input },
        deps,
      );
      // A code, and at most the setting at fault: the wording is in the message file (T-187).
      expect(result).toMatchObject({ ok: false, error: { code: 'invalid-rules' } });
      if (!result.ok) expect(Object.keys(result.error).sort()).not.toContain('message');
    }
    expect(db.state.seasons[0]?.rules).toBeUndefined();
  });

  it('gives a version conflict, refuses a clash, a missing season, nothing to set and non-admins', async () => {
    const { deps, as } = memoryLeagues({ seasons: [{ ...season, jerseyClash: true, version: 3 }] });
    const code = async (who: string, input: object) => {
      const r = await setSeasonRosterSettings(as(who), input, deps);
      return r.ok ? 'ok' : r.error.code;
    };
    expect(await code(ownerId, { seasonId: id(1), version: 1, maxSize: 8 })).toBe(
      'changed-since-read',
    );
    expect(await code(ownerId, { seasonId: id(1), version: 3, uniqueJerseys: true })).toBe(
      'unique-jerseys-clash',
    );
    expect(await code(ownerId, { seasonId: id(9), version: 1, maxSize: 8 })).toBe(
      'season-not-found',
    );
    expect(await code(ownerId, { seasonId: id(1), version: 3 })).toBe('invalid-input');
    expect(await code(staffId, { seasonId: id(1), version: 3, maxSize: 8 })).toBe('not-allowed');
  });
});
