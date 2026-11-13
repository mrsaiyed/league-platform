import { describe, expect, it } from 'vitest';
import { leagueStatuses } from '../league-values.ts';
import { isLeagueHidden, mayOpenLeague } from './league-visibility.ts';

describe('mayOpenLeague (U-9)', () => {
  it('shows live and archived leagues to everyone', () => {
    for (const status of ['live', 'archived'] as const) {
      expect(mayOpenLeague(status, false)).toBe(true);
      expect(mayOpenLeague(status, true)).toBe(true);
    }
  });

  it('shows draft and suspended leagues only to the people who run them', () => {
    for (const status of ['draft', 'suspended'] as const) {
      expect(isLeagueHidden(status)).toBe(true);
      expect(mayOpenLeague(status, false)).toBe(false);
      expect(mayOpenLeague(status, true)).toBe(true);
    }
  });

  it('has an answer for every state', () => {
    for (const status of leagueStatuses)
      expect(typeof mayOpenLeague(status, false)).toBe('boolean');
  });
});
