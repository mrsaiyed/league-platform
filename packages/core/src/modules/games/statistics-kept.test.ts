import { defaultSeasonRules } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { statisticsKept } from './statistics-kept.ts';

const full = { ...defaultSeasonRules(), statistics: 'full' as const };

describe('statisticsKept', () => {
  it("keeps the rules' set, in its order, when the season names none", () => {
    expect(statisticsKept([], defaultSeasonRules())).toEqual(['points', 'fg3', 'fg1', 'fouls']);
    expect(statisticsKept([], full)).toContain('turnovers');
    expect(statisticsKept([], defaultSeasonRules())).not.toContain('turnovers');
  });

  it('keeps the list a season names, in its order', () => {
    expect(statisticsKept(['points', 'rebounds', 'fouls'], full)).toEqual([
      'points',
      'rebounds',
      'fouls',
    ]);
  });

  it('reads rules it cannot read, or none, as the starting set', () => {
    expect(statisticsKept([], undefined)).toEqual(['points', 'fg3', 'fg1', 'fouls']);
    expect(statisticsKept([], { nonsense: true })).toEqual(['points', 'fg3', 'fg1', 'fouls']);
  });
});
