import { describe, expect, it } from 'vitest';
import { memoryPeople, ownerId, person, personUuid } from '../memory-people.test-helper.ts';
import { removePerson } from './remove-person.ts';

describe('removePerson', () => {
  it('moves a person to the bin and keeps the row (A-5)', async () => {
    const { db, deps, as } = memoryPeople({ people: [person(1)] });
    expect(await removePerson(as(ownerId), { personId: personUuid(1) }, deps)).toMatchObject({
      ok: true,
    });
    expect(db.state.people).toHaveLength(1);
    expect(db.state.people[0]?.binned).toBe(true);
    expect(db.state.activity.map((a) => a.action)).toEqual(['people.remove_person']);
  });

  it('refuses while the person is on a roster', async () => {
    const { db, deps, as } = memoryPeople({ people: [person(1, { onRoster: true })] });
    expect(await removePerson(as(ownerId), { personId: personUuid(1) }, deps)).toEqual({
      ok: false,
      error: { code: 'person-on-a-roster' },
    });
    expect(db.state.people[0]?.binned).toBe(false);
  });

  it('refuses one already in the bin or missing, and people with no role', async () => {
    const { deps, as } = memoryPeople({ people: [person(1, { binned: true })] });
    for (const n of [1, 9]) {
      expect(await removePerson(as(ownerId), { personId: personUuid(n) }, deps)).toMatchObject({
        error: { code: 'person-not-found' },
      });
    }
    expect(await removePerson(as('someone'), { personId: personUuid(1) }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
  });
});
