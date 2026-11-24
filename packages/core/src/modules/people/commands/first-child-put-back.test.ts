// S-109 (step 2.243): the first child an adult league records, by a new person or a
// changed one, puts a confirmed "children in full" back to no in the same save.
import { describe, expect, it } from 'vitest';
import type { Audience } from '../../leagues/index.ts';
import { memoryPeople, ownerId, person } from '../memory-people.test-helper.ts';
import { createPerson } from './create-person.ts';
import { updatePerson } from './update-person.ts';

const yes = { 'privacy.childrenInFullConfirmed': true };
const childBorn = '2012-03-04';
const adultBorn = '1990-03-04';
// person(n) is a child unless told otherwise: the league's one person here is an adult.
const grown = person(1, {
  sensitiveFields: { contactEmail: null, birthDate: adultBorn, isMinor: false },
});
const adultLeague = (audience: Audience = 'adult', people = [grown]) =>
  memoryPeople({ status: 'live', audience, settings: { ...yes }, people });

describe('the first child recorded in an adult league (S-109)', () => {
  it('a new person with a child birth date puts the yes back to no, and says so', async () => {
    const { db, deps, as } = adultLeague();
    const result = await createPerson(
      as(ownerId),
      { firstName: 'Kid', lastName: 'One', birthDate: childBorn },
      deps,
    );
    expect(result).toMatchObject({ ok: true, value: { clearedChildrenInFull: true } });
    expect(db.state.settings).toEqual({});
    expect(db.state.activity.map((a) => a.action)).toEqual([
      'people.create_person',
      'leagues.clear_setting',
    ]);
  });

  it('a new person ticked as a child does the same', async () => {
    const { db, deps, as } = adultLeague();
    const result = await createPerson(
      as(ownerId),
      { firstName: 'Kid', lastName: 'One', isMinor: true },
      deps,
    );
    expect(result).toMatchObject({ ok: true, value: { clearedChildrenInFull: true } });
    expect(db.state.settings).toEqual({});
  });

  it('an adult, or a person with no age, changes nothing', async () => {
    const { db, deps, as } = adultLeague();
    const adult = await createPerson(
      as(ownerId),
      { firstName: 'Ada', lastName: 'Grown', birthDate: adultBorn },
      deps,
    );
    const unknown = await createPerson(as(ownerId), { firstName: 'No', lastName: 'Age' }, deps);
    expect(adult).toEqual({ ok: true, value: { personId: expect.any(String) } });
    expect(unknown).toEqual({ ok: true, value: { personId: expect.any(String) } });
    expect(db.state.settings).toEqual(yes);
  });

  it('a second child changes nothing: the yes was given while the league had a child', async () => {
    const child = person(1, {
      sensitiveFields: { contactEmail: null, birthDate: childBorn, isMinor: null },
    });
    const { db, deps, as } = adultLeague('adult', [child]);
    const result = await createPerson(
      as(ownerId),
      { firstName: 'Kid', lastName: 'Two', isMinor: true },
      deps,
    );
    expect(result).toEqual({ ok: true, value: { personId: expect.any(String) } });
    expect(db.state.settings).toEqual(yes);
  });

  it('a child in the bin is not recorded: the next child is the first again', async () => {
    const binned = person(1, {
      binned: true,
      sensitiveFields: { contactEmail: null, birthDate: childBorn, isMinor: true },
    });
    const { db, deps, as } = adultLeague('adult', [binned]);
    await createPerson(as(ownerId), { firstName: 'Kid', lastName: 'Two', isMinor: true }, deps);
    expect(db.state.settings).toEqual({});
  });

  it.each(['youth', 'mixed'] as const)(
    'a league for children (%s) is never touched',
    async (audience) => {
      const { db, deps, as } = adultLeague(audience);
      const made = await createPerson(
        as(ownerId),
        { firstName: 'Kid', lastName: 'One', birthDate: childBorn },
        deps,
      );
      const personId = made.ok ? made.value.personId : '';
      await updatePerson(as(ownerId), { personId, version: 1, isMinor: true }, deps);
      expect(db.state.settings).toEqual(yes);
    },
  );

  it('a birth date changed to a child, or the tick put on, puts the yes back', async () => {
    for (const change of [{ birthDate: childBorn }, { isMinor: true }]) {
      const { db, deps, as } = adultLeague();
      const result = await updatePerson(
        as(ownerId),
        { personId: grown.id, version: 1, isMinor: null, ...change },
        deps,
      );
      expect(result).toEqual({ ok: true, value: { version: 2, clearedChildrenInFull: true } });
      expect(db.state.settings).toEqual({});
      expect(db.state.activity.map((a) => a.action)).toEqual([
        'people.update_person',
        'leagues.clear_setting',
      ]);
    }
  });

  it('a change that keeps the person an adult changes nothing', async () => {
    const { db, deps, as } = adultLeague();
    const result = await updatePerson(
      as(ownerId),
      { personId: grown.id, version: 1, birthDate: adultBorn, lastName: 'Else' },
      deps,
    );
    expect(result).toEqual({ ok: true, value: { version: 2 } });
    expect(db.state.settings).toEqual(yes);
  });

  it('an adult league with no yes saved records its first child and nothing is cleared', async () => {
    const { db, deps, as } = memoryPeople({ audience: 'adult', people: [grown] });
    const result = await createPerson(
      as(ownerId),
      { firstName: 'Kid', lastName: 'One', isMinor: true },
      deps,
    );
    expect(result).toEqual({ ok: true, value: { personId: expect.any(String) } });
    expect(db.state.activity.map((a) => a.action)).toEqual(['people.create_person']);
  });
});
