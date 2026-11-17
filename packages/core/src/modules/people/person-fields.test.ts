import { describe, expect, it } from 'vitest';
import { wrongPersonFields } from './person-fields.ts';

describe('wrongPersonFields', () => {
  it('finds nothing wrong in a whole, plain person', () => {
    expect(
      wrongPersonFields({
        firstName: 'Jon',
        lastName: 'Smith',
        contactEmail: 'jon@example.test',
        birthDate: '2012-03-04',
      }),
    ).toEqual([]);
  });

  it('marks an empty name, a name too long, an address with no @ and a day that is not one', () => {
    expect(
      wrongPersonFields({
        firstName: '  ',
        lastName: 'x'.repeat(101),
        contactEmail: 'jon.example.test',
        birthDate: '2012-02-30',
      }),
    ).toEqual(['firstName', 'lastName', 'contactEmail', 'birthDate']);
  });

  it('refuses a birth date after today or before 1900, as the commands do', () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    expect(wrongPersonFields({ birthDate: tomorrow })).toEqual(['birthDate']);
    expect(wrongPersonFields({ birthDate: '1899-12-31' })).toEqual(['birthDate']);
  });

  it('takes an empty email or birth date as clearing it, and a value left out as unchanged', () => {
    expect(wrongPersonFields({ contactEmail: '', birthDate: ' ' })).toEqual([]);
    expect(wrongPersonFields({})).toEqual([]);
  });
});
