import { describe, expect, it } from 'vitest';
import { gameWhenText } from './game-when.ts';

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
