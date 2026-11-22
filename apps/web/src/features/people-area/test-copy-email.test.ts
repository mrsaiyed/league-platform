import { describe, expect, it } from 'vitest';
import { newPersonInput, personChangeInput, wasField } from './person-input.ts';
import { emailNotTakenHere } from './test-copy-email.ts';

const named = { firstName: 'Jon', lastName: 'Smith' };

describe('the test copy takes only a made-up contact email (step 2.205, T-13, T-201)', () => {
  it('refuses a real address an admin types when adding or fixing someone', () => {
    for (const contactEmail of [
      'someone@gmail.com',
      ' Guardian@Gmail.com ',
      'a@example.test.gmail.com',
    ]) {
      expect(emailNotTakenHere({ ...named, contactEmail }, true), contactEmail).toBe(true);
      expect(
        emailNotTakenHere({ ...named, contactEmail, [wasField('contactEmail')]: '' }, true),
        contactEmail,
      ).toBe(true);
    }
  });

  it('takes a made-up address, an emptied box and an email left as it was', () => {
    for (const contactEmail of ['jon@example.test', 'parent@league.test', '', '  ']) {
      expect(emailNotTakenHere({ ...named, contactEmail }, true), contactEmail).toBe(false);
    }
    // A box not changed is not saved (personChangeInput), so it is not judged.
    const untouched = {
      ...named,
      contactEmail: 'old@gmail.com',
      [wasField('contactEmail')]: 'old@gmail.com',
    };
    expect(emailNotTakenHere(untouched, true)).toBe(false);
    expect(personChangeInput({ personId: 'p', version: '1', ...untouched })).not.toHaveProperty(
      'contactEmail',
    );
    expect(emailNotTakenHere(named, true)).toBe(false);
  });

  it('refuses nothing off the test copy (production and local work)', () => {
    const fields = { ...named, contactEmail: 'someone@gmail.com' };
    expect(emailNotTakenHere(fields, false)).toBe(false);
    expect(newPersonInput(fields)).toMatchObject({ contactEmail: 'someone@gmail.com' });
  });
});
