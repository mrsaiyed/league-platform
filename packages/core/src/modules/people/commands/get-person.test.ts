import { describe, expect, it } from 'vitest';
import {
  memoryPeople,
  ownerId,
  person,
  personUuid,
  registrarGrant,
  registrarId,
  scorekeeperGrant,
  scorekeeperId,
} from '../memory-people.test-helper.ts';
import { getPerson } from './get-person.ts';

const setUp = (extra: object = {}) =>
  memoryPeople({
    people: [
      person(1, { firstName: 'Jon', lastName: 'Smiht', version: 3 }),
      person(2, { binned: true }),
    ],
    grants: [registrarGrant, scorekeeperGrant],
    ...extra,
  });

describe('getPerson', () => {
  it('reads one person with their version, and the sensitive fields for a registrar', async () => {
    const { deps, as } = setUp();
    const result = await getPerson(as(registrarId), { personId: personUuid(1) }, deps);
    expect(result).toMatchObject({
      ok: true,
      value: {
        id: personUuid(1),
        firstName: 'Jon',
        lastName: 'Smiht',
        version: 3,
        sensitive: { contactEmail: 'p1@example.test', birthDate: '2011-04-05', isMinor: true },
      },
    });
  });

  it('is refused to a scorekeeper before anything is read: no people.read (R-16, T-76)', async () => {
    const { db, deps, as } = setUp();
    const result = await getPerson(as(scorekeeperId), { personId: personUuid(1) }, deps);
    expect(result).toMatchObject({ ok: false, error: { code: 'not-allowed' } });
    expect(db.state.sensitiveReads).toBe(0);
    // The refusal names nothing of the person.
    expect(JSON.stringify(result)).not.toMatch(/Smiht|example\.test|2011/);
  });

  it('does not find a person in the bin, or one the league does not have', async () => {
    const { deps, as } = setUp();
    for (const personId of [personUuid(2), personUuid(9)]) {
      expect(await getPerson(as(ownerId), { personId }, deps)).toMatchObject({
        ok: false,
        error: { code: 'person-not-found' },
      });
    }
  });

  it('reads in an archived league too: reading changes nothing (U-9)', async () => {
    const { deps, as } = setUp({ status: 'archived' });
    expect(await getPerson(as(ownerId), { personId: personUuid(1) }, deps)).toMatchObject({
      ok: true,
    });
  });

  it('refuses an id that is not one', async () => {
    const { deps, as } = setUp();
    expect(await getPerson(as(ownerId), { personId: 'smiht' }, deps)).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  });
});
