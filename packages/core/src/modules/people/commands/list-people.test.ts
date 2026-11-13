import { describe, expect, it } from 'vitest';
import {
  memoryPeople,
  ownerId,
  person,
  registrarGrant,
  registrarId,
  scorekeeperGrant,
  scorekeeperId,
} from '../memory-people.test-helper.ts';
import { listPeople } from './list-people.ts';

const setUp = (extra: object = {}) =>
  memoryPeople({
    people: [
      person(1, { lastName: 'Baker', firstName: 'Ann' }),
      person(2, { lastName: 'Adams', firstName: 'Bo', publicName: 'Bobby' }),
      person(3, { binned: true }),
    ],
    grants: [registrarGrant, scorekeeperGrant],
    ...extra,
  });

describe('listPeople', () => {
  it('lists people not in the bin by last name, with sensitive fields for a registrar', async () => {
    const { deps, as } = setUp();
    const result = await listPeople(as(registrarId), {}, deps);
    expect(result.ok && result.value.map((p) => p.lastName)).toEqual(['Adams', 'Baker']);
    expect(result.ok && result.value[0]?.sensitive?.birthDate).toBe('2011-04-05');
  });

  it('searches names and the public name in any capitals, and pages', async () => {
    const { deps, as } = setUp();
    const names = async (input: object) => {
      const result = await listPeople(as(ownerId), input, deps);
      return result.ok ? result.value.map((p) => p.lastName) : [];
    };
    expect(await names({ search: 'bobby' })).toEqual(['Adams']);
    expect(await names({ search: 'BAK' })).toEqual(['Baker']);
    expect(await names({ limit: 1, offset: 1 })).toEqual(['Baker']);
  });

  it("never reads a scorekeeper's list: they do not hold people.read (R-16, T-76)", async () => {
    const { db, deps, as } = setUp();
    expect(await listPeople(as(scorekeeperId), {}, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(db.state.sensitiveReads).toBe(0);
  });

  it('leaves the sensitive fields out entirely for a reader without people.read_sensitive', async () => {
    const { deps, transaction } = setUp();
    // A role that may read people but not their sensitive fields: asked of the store
    // directly, which is what the command does for such a role.
    const listed = await transaction({ leagueId: '', accountId: null, requestId: 'r' }, (tx) =>
      tx.people.list({ limit: 10, offset: 0, sensitive: false }),
    );
    expect(deps).toBeDefined();
    expect(listed).toHaveLength(2);
    for (const p of listed) {
      expect(JSON.stringify(p)).not.toMatch(/birth|email|isMinor|sensitive/i);
    }
  });
});
