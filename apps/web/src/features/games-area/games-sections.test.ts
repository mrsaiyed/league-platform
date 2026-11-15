import { describe, expect, it } from 'vitest';
import { gamesSections } from './games-sections.ts';

const g = (id: string, day: string) => ({ id, day });

describe('gamesSections', () => {
  it('puts each game once: needing a result, today, or under its day', () => {
    const needs = [g('old', '2026-11-12'), g('live', '2026-11-15'), g('morning', '2026-11-15')];
    const week = [
      g('live', '2026-11-15'),
      g('morning', '2026-11-15'),
      g('tonight', '2026-11-15'),
      g('tue', '2026-11-17'),
      g('mon', '2026-11-16'),
      g('tue2', '2026-11-17'),
    ];
    expect(gamesSections(needs, week, '2026-11-15')).toEqual({
      needsResult: needs,
      today: [g('tonight', '2026-11-15')],
      days: [
        { day: '2026-11-16', games: [g('mon', '2026-11-16')] },
        { day: '2026-11-17', games: [g('tue', '2026-11-17'), g('tue2', '2026-11-17')] },
      ],
    });
  });

  it('keeps a game under way since last night under Today when it is not among those needing a result', () => {
    const sections = gamesSections([], [g('live', '2026-11-14')], '2026-11-15');
    expect(sections.today.map((x) => x.id)).toEqual(['live']);
    expect(sections.days).toEqual([]);
  });

  it('has nothing to lay out with no games', () => {
    expect(gamesSections([], [], '2026-11-15')).toEqual({ needsResult: [], today: [], days: [] });
  });
});
