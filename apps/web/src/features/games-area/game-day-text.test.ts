import type { EarlierRound } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { dayHeadingText, earlierRoundText } from './game-day-text.ts';

const round: EarlierRound = {
  key: 'r-01900000-0000-7000-8000-0000000d0001',
  seasonId: '01900000-0000-7000-8000-0000000000c1',
  roundId: '01900000-0000-7000-8000-0000000d0001',
  number: 3,
  label: null,
  firstDay: '2026-11-08',
  lastDay: '2026-11-08',
  games: 4,
};

describe('the games list headings', () => {
  it('says Tomorrow for the next day and the date after it, as the calendar day', () => {
    expect(dayHeadingText('2026-11-16', '2026-11-15', 'en-US')).toBe('Tomorrow');
    expect(dayHeadingText('2026-11-18', '2026-11-15', 'en-US')).toBe('Wednesday, November 18');
    // Across a month's end.
    expect(dayHeadingText('2026-12-01', '2026-11-30', 'en-US')).toBe('Tomorrow');
  });

  it('names an earlier round by its number or its own name, its days and its games', () => {
    expect(earlierRoundText(round, undefined, 'en-US')).toBe('Round 3, Sun, Nov 8 (4)');
    expect(
      earlierRoundText(
        { ...round, label: 'Opening day', lastDay: '2026-11-09', games: 1 },
        'Fall 2026',
        'en-US',
      ),
    ).toBe('Opening day, Fall 2026, Sun, Nov 8 to Mon, Nov 9 (1)');
    expect(earlierRoundText({ ...round, roundId: null, number: null }, undefined, 'en-US')).toBe(
      'Games outside a round, Sun, Nov 8 (4)',
    );
  });
});
