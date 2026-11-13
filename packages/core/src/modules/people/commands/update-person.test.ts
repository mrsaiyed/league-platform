import { describe, expect, it } from 'vitest';
import { memoryPeople, ownerId, person, personUuid } from '../memory-people.test-helper.ts';
import { updatePerson } from './update-person.ts';

const setUp = () => memoryPeople({ people: [person(1), person(2, { binned: true })] });

describe('updatePerson', () => {
  it('changes names and sensitive fields, and logs the field names only', async () => {
    const { db, deps, as } = setUp();
    const result = await updatePerson(
      as(ownerId),
      {
        personId: personUuid(1),
        version: 1,
        lastName: 'Okafor',
        contactEmail: 'new@example.test',
        birthDate: null,
      },
      deps,
    );
    expect(result).toEqual({ ok: true, value: { version: 2 } });
    expect(db.state.people[0]).toMatchObject({
      lastName: 'Okafor',
      sensitiveFields: { contactEmail: 'new@example.test', birthDate: null, isMinor: true },
    });
    expect(db.state.activity).toMatchObject([
      { action: 'people.update_person', details: { changed: 'lastName,contactEmail,birthDate' } },
    ]);
    expect(JSON.stringify(db.state.activity)).not.toContain('example.test');
  });

  it('changes nothing and logs nothing when nothing differs', async () => {
    const { db, deps, as } = setUp();
    expect(
      await updatePerson(
        as(ownerId),
        { personId: personUuid(1), version: 1, firstName: 'First1', isMinor: true },
        deps,
      ),
    ).toEqual({ ok: true, value: { version: 1 } });
    expect(db.state.activity).toEqual([]);
  });

  it('refuses a stale version (T-46), a binned person and a missing one', async () => {
    const { deps, as } = setUp();
    const codeOf = async (input: object) => {
      const result = await updatePerson(as(ownerId), input, deps);
      return result.ok ? 'ok' : result.error.code;
    };
    expect(await codeOf({ personId: personUuid(1), version: 4, firstName: 'X' })).toBe(
      'changed-since-read',
    );
    expect(await codeOf({ personId: personUuid(2), version: 1, firstName: 'X' })).toBe(
      'person-not-found',
    );
    expect(await codeOf({ personId: personUuid(9), version: 1, firstName: 'X' })).toBe(
      'person-not-found',
    );
  });

  it('needs a change, and refuses anyone without people.manage', async () => {
    const { deps, as } = setUp();
    expect(
      await updatePerson(as(ownerId), { personId: personUuid(1), version: 1 }, deps),
    ).toMatchObject({ error: { code: 'invalid-input' } });
    expect(
      await updatePerson(
        as('someone'),
        { personId: personUuid(1), version: 1, firstName: 'X' },
        deps,
      ),
    ).toMatchObject({ error: { code: 'not-allowed' } });
  });
});
