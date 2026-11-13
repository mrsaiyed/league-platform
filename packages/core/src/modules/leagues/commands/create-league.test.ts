// createLeague on a stand-in store; the database's own rules are tested in packages/database.
import { describe, expect, it } from 'vitest';
import { leagueId, memoryLeagues, ownerId, staffId } from '../memory-leagues.test-helper.ts';
import { createLeague } from './create-league.ts';

const input = {
  slug: 'north-hoops',
  name: '  North Hoops ',
  timeZone: 'America/Chicago',
  audience: 'adult',
  ownerAccountId: ownerId,
  sportKey: 'basketball',
};
const none = { league: undefined, programs: [] };

describe('createLeague', () => {
  it('creates a draft league with its default program', async () => {
    const { db, deps, as } = memoryLeagues(none);
    const result = await createLeague(as(staffId), input, deps);
    expect(result).toMatchObject({
      ok: true,
      value: {
        id: leagueId,
        slug: 'north-hoops',
        name: 'North Hoops',
        status: 'draft',
        version: 1,
      },
    });
    expect(db.state.programs).toMatchObject([{ slug: 'main', isDefault: true }]);
  });

  it('refuses anyone who is not our staff, and nobody signed in', async () => {
    for (const account of [ownerId, null]) {
      const { db, deps, as } = memoryLeagues(none);
      expect(await createLeague(as(account), input, deps)).toEqual({
        ok: false,
        error: { code: 'not-allowed' },
      });
      expect(db.state.league).toBeUndefined();
    }
  });

  it('refuses a blocked short name, a taken one, and a league id already in use (U-7)', async () => {
    const { deps, as } = memoryLeagues(none);
    expect(await createLeague(as(staffId), { ...input, slug: 'admin' }, deps)).toMatchObject({
      error: { code: 'short-name-blocked' },
    });
    expect(await createLeague(as(staffId), { ...input, slug: 'taken-name' }, deps)).toMatchObject({
      error: { code: 'short-name-taken' },
    });
    const existing = memoryLeagues();
    expect(await createLeague(existing.as(staffId), input, existing.deps)).toMatchObject({
      error: { code: 'league-exists' },
    });
  });

  it('refuses short names that break the format, and bad time zones and audiences', async () => {
    const { deps, as } = memoryLeagues(none);
    const bad = [
      { slug: 'ab' },
      { slug: 'x'.repeat(41) },
      { slug: 'Upper-Case' },
      { slug: 'has_underscore' },
      { timeZone: 'Mars/Base' },
      { audience: 'everyone' },
      { ownerAccountId: 'not-an-id' },
    ];
    for (const change of bad) {
      expect(await createLeague(as(staffId), { ...input, ...change }, deps)).toMatchObject({
        error: { code: 'invalid-input' },
      });
    }
  });
});
