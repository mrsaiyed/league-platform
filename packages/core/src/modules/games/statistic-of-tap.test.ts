// Which taps name a statistic a season may not keep (S-93, step 2.241, T-391).
import { seasonRulesPreset } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { keptForScoring, statisticOfTap, tapNotKept } from './statistic-of-tap.ts';

describe('the statistic a tap records', () => {
  it('is turnovers for a player’s or the team’s turnover', () => {
    for (const type of ['turnover', 'team-turnover']) {
      expect(statisticOfTap(type), type).toBe('turnovers');
    }
  });

  it('is none for taking a turnover back, always taken (T-394)', () => {
    for (const type of ['unturnover', 'team-unturnover']) {
      expect(statisticOfTap(type), type).toBeUndefined();
      expect(
        tapNotKept(type, keptForScoring(seasonRulesPreset('high-school'))),
        type,
      ).toBeUndefined();
    }
  });

  it('is none for points, fouls and every tap that records no statistic', () => {
    for (const type of ['score', 'foul', 'unfoul', 'lineup', 'sub', 'timeout', 'start', 'undo']) {
      expect(statisticOfTap(type), type).toBeUndefined();
    }
    expect(statisticOfTap('toString')).toBeUndefined();
  });

  it('is not kept in a season keeping the standard set, and kept in one keeping the full set', () => {
    const standard = seasonRulesPreset('high-school');
    expect(standard.statistics).toBe('standard');
    expect(tapNotKept('team-turnover', keptForScoring(standard))).toBe('turnovers');
    expect(tapNotKept('foul', keptForScoring(standard))).toBeUndefined();
    const full = keptForScoring({ ...standard, statistics: 'full' });
    expect(tapNotKept('turnover', full)).toBeUndefined();
  });
});
