// R-28 (changed November 17): a child if their birth date says so or the "minor" tick is
// on; a date that says adult unticks no one; a date that cannot be read is a child's; a
// player typed in at a scorer's table with neither is a child until an admin says (S-136).
import { describe, expect, it } from 'vitest';
import { dayIn } from '../../leagues/index.ts';
import { isMinorOn, type MinorFacts } from './minor-by-age.ts';
import { shownAsChild } from './name-policy.ts';

const today = '2026-11-16';
const notAtTable = { addedAtTable: false };
const atTable = { addedAtTable: true };
const person = (birthDate: string | null, isMinor: boolean | null): MinorFacts => ({
  birthDate,
  isMinor,
});

describe('isMinorOn (R-28)', () => {
  it('counts a person whose birth date makes them a child as a child, the tick off', () => {
    expect(isMinorOn(person('2012-09-03', false), today, notAtTable)).toBe(true);
    // And where the league does not know either: the date says.
    expect(isMinorOn(person('2012-09-03', null), today, notAtTable)).toBe(true);
  });

  it('keeps a ticked person a child though their birth date says adult', () => {
    expect(isMinorOn(person('1990-04-12', true), today, notAtTable)).toBe(true);
    // A birth year mistyped far in the past unticks no one.
    expect(isMinorOn(person('1912-09-03', true), today, notAtTable)).toBe(true);
  });

  it('counts an unticked person whose birth date says adult as an adult', () => {
    expect(isMinorOn(person('1990-04-12', false), today, notAtTable)).toBe(false);
    expect(isMinorOn(person('1990-04-12', null), today, notAtTable)).toBe(false);
  });

  it('leaves it to the tick where there is no birth date', () => {
    expect(isMinorOn(person(null, true), today, notAtTable)).toBe(true);
    expect(isMinorOn(person(null, false), today, notAtTable)).toBe(false);
    expect(isMinorOn(person(null, null), today, notAtTable)).toBeNull();
    // A stored value that is neither counts as not known.
    expect(
      isMinorOn({ birthDate: null, isMinor: 'yes' as unknown as boolean }, today, notAtTable),
    ).toBeNull();
  });

  it("counts a player typed in at a scorer's table, with no date and no tick, as a child", () => {
    expect(isMinorOn(person(null, null), today, atTable)).toBe(true);
    expect(shownAsChild(isMinorOn(person(null, null), today, atTable), 'adult')).toBe(true);
    // Until an admin says otherwise: the tick off, or a date that says adult.
    expect(isMinorOn(person(null, false), today, atTable)).toBe(false);
    expect(isMinorOn(person('1990-04-12', null), today, atTable)).toBe(false);
    expect(isMinorOn(person('1990-04-12', false), today, atTable)).toBe(false);
    // The tick on, or a date that says child, as for anyone.
    expect(isMinorOn(person(null, true), today, atTable)).toBe(true);
    expect(isMinorOn(person('2012-09-03', null), today, atTable)).toBe(true);
  });

  it('is a child the day before their 18th birthday, and an adult on it, unticked', () => {
    const born = person('2008-11-16', false);
    expect(isMinorOn(born, '2026-11-15', notAtTable)).toBe(true);
    expect(isMinorOn(born, '2026-11-16', notAtTable)).toBe(false);
    // Ticked, their 18th birthday changes nothing: the admin unticks to show more.
    expect(isMinorOn(person('2008-11-16', true), '2026-11-16', notAtTable)).toBe(true);
    expect(isMinorOn(person('2008-11-17', false), '2026-11-16', notAtTable)).toBe(true);
    // Across a year's end.
    expect(isMinorOn(person('2009-01-01', false), '2026-12-31', notAtTable)).toBe(true);
    expect(isMinorOn(person('2009-01-01', false), '2027-01-01', notAtTable)).toBe(false);
  });

  it("decides the birthday on the league's own day, in its time zone", () => {
    // 03:00 in London on 3 September 2030 is still 2 September in Chicago.
    const at = Date.UTC(2030, 8, 3, 3, 0, 0);
    const born = person('2012-09-03', false);
    expect(isMinorOn(born, dayIn('America/Chicago', at), notAtTable)).toBe(true);
    expect(isMinorOn(born, dayIn('Europe/London', at), notAtTable)).toBe(false);
    // And a league east of London is already a day on.
    const late = Date.UTC(2030, 8, 2, 20, 0, 0);
    expect(isMinorOn(born, dayIn('Asia/Tokyo', late), notAtTable)).toBe(false);
    expect(isMinorOn(born, dayIn('America/Chicago', late), notAtTable)).toBe(true);
  });

  it('keeps someone born on 29 February a child until 1 March in a year with no 29th', () => {
    const leap = person('2008-02-29', false);
    expect(isMinorOn(leap, '2026-02-28', notAtTable)).toBe(true);
    expect(isMinorOn(leap, '2026-03-01', notAtTable)).toBe(false);
    // 18 years after a leap year is never one, so this is every 29 February child's case.
    expect(isMinorOn(person('2004-02-29', false), '2022-02-28', notAtTable)).toBe(true);
    expect(isMinorOn(person('2004-02-29', false), '2022-03-01', notAtTable)).toBe(false);
    // Born on a 28th or a 1st in a year 18 before a leap year: the 29th changes nothing.
    expect(isMinorOn(person('2006-02-28', null), '2024-02-28', notAtTable)).toBe(false);
    expect(isMinorOn(person('2006-03-01', false), '2024-02-29', notAtTable)).toBe(true);
  });

  it('counts a birth date after today as a child (it cannot be saved: T3 §3)', () => {
    expect(isMinorOn(person('2026-11-17', false), today, notAtTable)).toBe(true);
    expect(isMinorOn(person('2030-01-01', null), today, notAtTable)).toBe(true);
  });

  it('counts a birth date that cannot be read as a child, tick on or off', () => {
    for (const isMinor of [true, false, null]) {
      for (const birthDate of ['3 Sept 2012', '', '2012-02-30', '2012-13-01', '20120903']) {
        expect(
          isMinorOn(person(birthDate, isMinor), today, notAtTable),
          `${birthDate} ${isMinor}`,
        ).toBe(true);
      }
    }
  });

  it('is what shownAsChild is given, so a child is never shown as an adult', () => {
    // An adult league, the tick off: by the tick alone the person would be an adult.
    expect(shownAsChild(false, 'adult')).toBe(false);
    expect(shownAsChild(isMinorOn(person('2012-09-03', false), today, notAtTable), 'adult')).toBe(
      true,
    );
    // The tick on, the date an adult's: still shown as a child.
    expect(shownAsChild(isMinorOn(person('1990-04-12', true), today, notAtTable), 'adult')).toBe(
      true,
    );
    // Unticked, the date an adult's: an adult, in a youth league too.
    expect(shownAsChild(isMinorOn(person('1990-04-12', false), today, notAtTable), 'youth')).toBe(
      false,
    );
    // Nothing known: the audience decides (R-15).
    expect(shownAsChild(isMinorOn(person(null, null), today, notAtTable), 'youth')).toBe(true);
    expect(shownAsChild(isMinorOn(person(null, null), today, notAtTable), 'adult')).toBe(false);
  });
});
