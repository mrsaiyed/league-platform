import { describe, expect, it } from 'vitest';
import { leagueScores, opensInTracker, scoresOnly } from './my-games.ts';

describe('the scorekeeper’s admin (P4 §4)', () => {
  it('is for those whose only area of the admin is Games', () => {
    expect(scoresOnly(['games'])).toBe(true);
    expect(scoresOnly(['schedule', 'games'])).toBe(false);
    expect(scoresOnly([])).toBe(false);
  });

  it('offers the tracker for a game to be played or being played, in a league that may score', () => {
    const live = { recording: 'live' } as const;
    expect(opensInTracker({ ...live, status: 'scheduled', scorable: true })).toBe(true);
    expect(opensInTracker({ ...live, status: 'live', scorable: true })).toBe(true);
    for (const status of ['final', 'forfeit', 'postponed', 'cancelled']) {
      expect(opensInTracker({ ...live, status, scorable: true })).toBe(false);
    }
    expect(opensInTracker({ ...live, status: 'live', scorable: false })).toBe(false);
  });

  it('offers the tracker only for a game recorded live', () => {
    for (const recording of ['final-score', 'box-score', undefined] as const) {
      expect(opensInTracker({ recording, status: 'scheduled', scorable: true })).toBe(false);
    }
  });

  it('scores in a league that is not archived or suspended', () => {
    for (const status of ['live', 'draft']) expect(leagueScores(status)).toBe(true);
    for (const status of ['archived', 'suspended']) expect(leagueScores(status)).toBe(false);
  });
});
