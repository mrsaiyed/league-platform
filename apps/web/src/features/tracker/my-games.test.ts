import { describe, expect, it } from 'vitest';
import { opensInTracker, scoresOnly } from './my-games.ts';

describe('the scorekeeper’s admin (P4 §4)', () => {
  it('is for those whose only area of the admin is Games', () => {
    expect(scoresOnly(['games'])).toBe(true);
    expect(scoresOnly(['schedule', 'games'])).toBe(false);
    expect(scoresOnly([])).toBe(false);
  });

  it('offers the tracker for a game to be played or being played, in a league that may score', () => {
    expect(opensInTracker({ status: 'scheduled', scorable: true })).toBe(true);
    expect(opensInTracker({ status: 'live', scorable: true })).toBe(true);
    for (const status of ['final', 'forfeit', 'postponed', 'cancelled']) {
      expect(opensInTracker({ status, scorable: true })).toBe(false);
    }
    expect(opensInTracker({ status: 'live', scorable: false })).toBe(false);
  });
});
