import { describe, expect, it } from 'vitest';
import {
  memoryPeople,
  ownerId,
  registrarGrant,
  registrarId,
  scorekeeperGrant,
  scorekeeperId,
} from '../memory-people.test-helper.ts';
import { createPerson } from './create-person.ts';

describe('createPerson', () => {
  it('adds a person with a name only, and logs it without their details', async () => {
    const { db, deps, as } = memoryPeople();
    const result = await createPerson(as(ownerId), { firstName: ' Sam ', lastName: 'Ng' }, deps);
    expect(result.ok).toBe(true);
    expect(db.state.people[0]).toMatchObject({
      firstName: 'Sam',
      lastName: 'Ng',
      publicName: null,
    });
    expect(db.state.activity.map((a) => a.action)).toEqual(['people.create_person']);
    expect(JSON.stringify(db.state.activity)).not.toContain('Sam');
  });

  it('keeps the public name, email, birth date and minor flag a registrar gives', async () => {
    const { db, deps, as } = memoryPeople({ grants: [registrarGrant] });
    const result = await createPerson(
      as(registrarId),
      {
        firstName: 'Sam',
        lastName: 'Ng',
        publicName: 'Sammy',
        contactEmail: 'sam@example.test',
        birthDate: '2011-04-05',
        isMinor: true,
      },
      deps,
    );
    expect(result.ok).toBe(true);
    expect(db.state.people[0]).toMatchObject({
      publicName: 'Sammy',
      sensitiveFields: { contactEmail: 'sam@example.test', birthDate: '2011-04-05', isMinor: true },
    });
  });

  it('refuses a bad email, a made-up or future birth date, and a missing name', async () => {
    const { deps, as } = memoryPeople();
    for (const bad of [
      { contactEmail: 'nobody' },
      { birthDate: '2011-02-30' },
      { birthDate: '1899-12-31' },
      { birthDate: '2999-01-01' },
      { firstName: '   ' },
    ]) {
      const result = await createPerson(
        as(ownerId),
        { firstName: 'A', lastName: 'B', ...bad },
        deps,
      );
      expect(result, JSON.stringify(bad)).toMatchObject({ error: { code: 'invalid-input' } });
    }
  });

  it('refuses people who may not manage people, and an archived league', async () => {
    const { deps, as } = memoryPeople({ grants: [scorekeeperGrant] });
    const input = { firstName: 'A', lastName: 'B' };
    expect(await createPerson(as(scorekeeperId), input, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(await createPerson(as(null), input, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    const archived = memoryPeople({ status: 'archived' });
    expect(await createPerson(archived.as(ownerId), input, archived.deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});
