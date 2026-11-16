import { describe, expect, it } from 'vitest';
import { gameWhenText, leagueDayText } from './game-when.ts';

describe('leagueDayText', () => {
  it('writes a day of the league’s calendar as the public pages write a day', () => {
    expect(leagueDayText('2026-10-02', 'en')).toBe('Fri, Oct 2');
    expect(leagueDayText('2027-01-24', 'en')).toBe('Sun, Jan 24');
    // The first and the last day of a year stay themselves: no zone moves a calendar day.
    expect(leagueDayText('2027-01-01', 'en')).toBe('Fri, Jan 1');
    expect(leagueDayText('2026-12-31', 'en')).toBe('Thu, Dec 31');
  });

  it('gives back a value that is not a day as it is', () => {
    expect(leagueDayText('', 'en')).toBe('');
    expect(leagueDayText('soon', 'en')).toBe('soon');
    expect(leagueDayText('2026-13-40', 'en')).toBe('2026-13-40');
  });
});

describe('gameWhenText', () => {
  const chicago = { locale: 'en', timeZone: 'America/Chicago' };

  it("writes the time in the league's time zone, not in UTC", () => {
    // 01:00 UTC on 6 December is 7 pm on 5 December in Chicago.
    expect(gameWhenText('2026-12-06T01:00:00.000Z', chicago)).toBe('Sat, Dec 5, 7:00 PM');
    expect(gameWhenText('2026-12-06T01:00:00.000Z', { locale: 'en', timeZone: 'UTC' })).toBe(
      'Sun, Dec 6, 1:00 AM',
    );
  });

  it('writes a game of today as today, and a game with no time as that', () => {
    expect(gameWhenText('2026-12-06T01:00:00.000Z', chicago, { today: true })).toBe(
      'Today, 7:00 PM',
    );
    expect(gameWhenText(null, chicago)).toBe('No time set');
  });

  it("uses the page's language", () => {
    // British English puts the day before the month (the exact commas vary by ICU version).
    expect(gameWhenText('2026-12-06T01:00:00.000Z', { locale: 'en-GB', timeZone: 'UTC' })).toMatch(
      /^Sun,? 6 Dec, /,
    );
  });
});
