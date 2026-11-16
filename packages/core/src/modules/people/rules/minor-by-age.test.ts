// R-28: a birth date, where there is one, decides whether a person is a child; the tick
// only where there is none.
import { describe, expect, it } from 'vitest';
import { dayIn } from '../../leagues/index.ts';
import { isMinorOn, type MinorFacts } from './minor-by-age.ts';
import { shownAsChild } from './name-policy.ts';

const today = '2026-11-16';
const person = (birthDate: string | null, isMinor: boolean | null): MinorFacts => ({
  birthDate,
  isMinor,
});

describe('isMinorOn (R-28)', () => {
  it('counts a person whose birth date makes them a child as a child, the tick off', () => {
    expect(isMinorOn(person('2012-09-03', false), today)).toBe(true);
    // And where the league does not know either: the date decides.
    expect(isMinorOn(person('2012-09-03', null), today)).toBe(true);
  });

  it('counts a person whose birth date makes them an adult as an adult, the tick on', () => {
    expect(isMinorOn(person('1990-04-12', true), today)).toBe(false);
    expect(isMinorOn(person('1990-04-12', null), today)).toBe(false);
  });

  it('leaves it to the tick where there is no birth date', () => {
    expect(isMinorOn(person(null, true), today)).toBe(true);
    expect(isMinorOn(person(null, false), today)).toBe(false);
    expect(isMinorOn(person(null, null), today)).toBeNull();
    // A stored value that is neither counts as not known.
    expect(isMinorOn({ birthDate: null, isMinor: 'yes' as unknown as boolean }, today)).toBeNull();
  });

  it('is a child the day before their 18th birthday, and an adult on it', () => {
    const born = person('2008-11-16', true);
    expect(isMinorOn(born, '2026-11-15')).toBe(true);
    expect(isMinorOn(born, '2026-11-16')).toBe(false);
    expect(isMinorOn(person('2008-11-17', false), '2026-11-16')).toBe(true);
    // Across a year's end.
    expect(isMinorOn(person('2009-01-01', false), '2026-12-31')).toBe(true);
    expect(isMinorOn(person('2009-01-01', false), '2027-01-01')).toBe(false);
  });

  it("decides the birthday on the league's own day, in its time zone", () => {
    // 03:00 in London on 3 September 2030 is still 2 September in Chicago.
    const at = Date.UTC(2030, 8, 3, 3, 0, 0);
    const born = person('2012-09-03', false);
    expect(isMinorOn(born, dayIn('America/Chicago', at))).toBe(true);
    expect(isMinorOn(born, dayIn('Europe/London', at))).toBe(false);
    // And a league east of London is already a day on.
    const late = Date.UTC(2030, 8, 2, 20, 0, 0);
    expect(isMinorOn(born, dayIn('Asia/Tokyo', late))).toBe(false);
    expect(isMinorOn(born, dayIn('America/Chicago', late))).toBe(true);
  });

  it('keeps someone born on 29 February a child until 1 March in a year with no 29th', () => {
    const leap = person('2008-02-29', false);
    expect(isMinorOn(leap, '2026-02-28')).toBe(true);
    expect(isMinorOn(leap, '2026-03-01')).toBe(false);
    // 18 years after a leap year is never one, so this is every 29 February child's case.
    expect(isMinorOn(person('2004-02-29', false), '2022-02-28')).toBe(true);
    expect(isMinorOn(person('2004-02-29', false), '2022-03-01')).toBe(false);
    // Born on a 28th or a 1st in a year 18 before a leap year: the 29th changes nothing.
    expect(isMinorOn(person('2006-02-28', true), '2024-02-28')).toBe(false);
    expect(isMinorOn(person('2006-03-01', false), '2024-02-29')).toBe(true);
  });

  it('counts a birth date after today as a child (it cannot be saved: T3 §3)', () => {
    expect(isMinorOn(person('2026-11-17', false), today)).toBe(true);
    expect(isMinorOn(person('2030-01-01', null), today)).toBe(true);
  });

  it('takes a value that is not a yyyy-mm-dd date as no birth date', () => {
    expect(isMinorOn(person('3 Sept 2012', false), today)).toBe(false);
    expect(isMinorOn(person('', null), today)).toBeNull();
  });

  it('is what shownAsChild is given, so an unticked child is never shown as an adult', () => {
    // An adult league, the tick off: by the tick alone the person would be an adult.
    expect(shownAsChild(false, 'adult')).toBe(false);
    expect(shownAsChild(isMinorOn(person('2012-09-03', false), today), 'adult')).toBe(true);
    // A youth league, the tick on, the date an adult's: shown as an adult.
    expect(shownAsChild(isMinorOn(person('1990-04-12', true), today), 'youth')).toBe(false);
    // Nothing known: the audience decides (R-15).
    expect(shownAsChild(isMinorOn(person(null, null), today), 'youth')).toBe(true);
    expect(shownAsChild(isMinorOn(person(null, null), today), 'adult')).toBe(false);
  });
});
