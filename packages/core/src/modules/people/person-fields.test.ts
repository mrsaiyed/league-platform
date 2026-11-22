import { describe, expect, it, vi } from 'vitest';
import { wrongPersonFields } from './person-fields.ts';

const today = '2026-11-16';

describe('wrongPersonFields', () => {
  it('finds nothing wrong in a whole, plain person', () => {
    expect(
      wrongPersonFields(
        {
          firstName: 'Jon',
          lastName: 'Smith',
          contactEmail: 'jon@example.test',
          birthDate: '2012-03-04',
        },
        today,
      ),
    ).toEqual([]);
  });

  it('marks an empty name, a name too long, an address with no @ and a day that is not one', () => {
    expect(
      wrongPersonFields(
        {
          firstName: '  ',
          lastName: 'x'.repeat(101),
          contactEmail: 'jon.example.test',
          birthDate: '2012-02-30',
        },
        today,
      ),
    ).toEqual(['firstName', 'lastName', 'contactEmail', 'birthDate']);
  });

  it("refuses a birth date after the league's today or before 1900, as the commands do", () => {
    expect(wrongPersonFields({ birthDate: '2026-11-17' }, today)).toEqual(['birthDate']);
    expect(wrongPersonFields({ birthDate: '2026-11-16' }, today)).toEqual([]);
    expect(wrongPersonFields({ birthDate: '1899-12-31' }, today)).toEqual(['birthDate']);
  });

  it("measures 'after today' on the league's today, not the server's day in UTC", () => {
    vi.useFakeTimers();
    try {
      // East of UTC (Auckland): the league is already on the 23rd while UTC is on the 22nd.
      vi.setSystemTime(new Date('2026-11-22T12:00:00Z'));
      expect(wrongPersonFields({ birthDate: '2026-11-23' }, '2026-11-23')).toEqual([]);
      // West of UTC (Los Angeles): UTC is on the 23rd, the league still on the 22nd.
      vi.setSystemTime(new Date('2026-11-23T03:00:00Z'));
      expect(wrongPersonFields({ birthDate: '2026-11-23' }, '2026-11-22')).toEqual(['birthDate']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('takes an empty email or birth date as clearing it, and a value left out as unchanged', () => {
    expect(wrongPersonFields({ contactEmail: '', birthDate: ' ' }, today)).toEqual([]);
    expect(wrongPersonFields({}, today)).toEqual([]);
  });
});
