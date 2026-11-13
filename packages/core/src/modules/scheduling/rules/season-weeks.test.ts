import { describe, expect, it } from 'vitest';
import { dateOfDay, dayNumber, seasonWeeks, weekdayOf } from './season-weeks.ts';

function day(date: string): number {
  const n = dayNumber(date);
  if (n === null) throw new Error(`not a date: ${date}`);
  return n;
}

describe('the season calendar (P7 §4.1)', () => {
  it('reads real dates only', () => {
    expect(dayNumber('1970-01-02')).toBe(1);
    expect(dateOfDay(day('2026-10-04'))).toBe('2026-10-04');
    expect(dayNumber('2026-02-30')).toBeNull();
    expect(dayNumber('2026-1-4')).toBeNull();
    expect(dayNumber('')).toBeNull();
  });

  it('knows the day of the week', () => {
    expect(weekdayOf(day('2026-10-04'))).toBe(0); // a Sunday
    expect(weekdayOf(day('2026-10-10'))).toBe(6); // a Saturday
    expect(weekdayOf(day('1969-12-31'))).toBe(3); // before 1970 too
  });

  it('lists the playing dates week by week, skipping the dates to skip', () => {
    const weeks = seasonWeeks(
      day('2026-10-03'),
      day('2026-10-25'),
      new Set([0, 6]),
      new Set(['2026-10-11', '2026-10-17', '2026-10-18']),
    );
    expect(weeks.map((w) => w.dates)).toEqual([
      ['2026-10-03', '2026-10-04'],
      ['2026-10-10'],
      [],
      ['2026-10-24', '2026-10-25'],
    ]);
    expect(weeks.map((w) => dateOfDay(w.firstDay))).toEqual([
      '2026-10-03',
      '2026-10-10',
      '2026-10-17',
      '2026-10-24',
    ]);
  });

  it('stops at the last date, part way through a week', () => {
    const weeks = seasonWeeks(day('2026-10-04'), day('2026-10-12'), new Set([1]), new Set());
    expect(weeks.map((w) => w.dates)).toEqual([['2026-10-05'], ['2026-10-12']]);
  });
});
