import { describe, expect, it, vi } from 'vitest';
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

  it("takes a birth date up to the league's own today, not the server's day in UTC", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      // East of UTC: the league is on the 23rd while UTC is on the 22nd; a child born today.
      vi.setSystemTime(new Date('2026-11-22T12:00:00Z'));
      const east = memoryPeople({ grants: [registrarGrant], today: '2026-11-23' });
      const born = await createPerson(
        east.as(registrarId),
        { firstName: 'Ava', lastName: 'Ng', birthDate: '2026-11-23' },
        east.deps,
      );
      expect(born.ok).toBe(true);
      expect(east.db.state.people[0]?.sensitiveFields.birthDate).toBe('2026-11-23');
      // West of UTC: UTC is on the 23rd, the league still on the 22nd: the 23rd is tomorrow.
      vi.setSystemTime(new Date('2026-11-23T03:00:00Z'));
      const west = memoryPeople({ grants: [registrarGrant], today: '2026-11-22' });
      const early = await createPerson(
        west.as(registrarId),
        { firstName: 'Ava', lastName: 'Ng', birthDate: '2026-11-23' },
        west.deps,
      );
      expect(early).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
      expect(west.db.state.people).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
