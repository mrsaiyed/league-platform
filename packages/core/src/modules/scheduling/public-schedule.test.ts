import { describe, expect, it } from 'vitest';
import { placeRounds, type PublicGame, type RoundToPlace } from './public-schedule.ts';

const team = { id: 't', slug: 't', name: 'T', color: null };
function game(localDate: string | null): PublicGame {
  return {
    id: `g-${String(localDate)}`,
    number: null,
    startsAt: null,
    localDate,
    status: 'scheduled',
    homeTeam: team,
    awayTeam: team,
    homeScore: null,
    awayScore: null,
    divisionName: null,
    venue: null,
    courtName: null,
  };
}
const round = (
  number: number,
  date: string | null,
  days: (string | null)[] = [],
): RoundToPlace => ({
  id: `r${number}`,
  number,
  label: null,
  date,
  games: days.map(game),
});

describe('placeRounds', () => {
  it('marks past rounds, the first open one as current, and the rest upcoming, in round order', () => {
    const placed = placeRounds(
      [round(3, '2026-12-01'), round(1, '2026-11-01'), round(2, '2026-11-10', ['2026-11-12'])],
      '2026-11-11',
    );
    expect(placed.map((r) => [r.number, r.phase])).toEqual([
      [1, 'past'],
      [2, 'current'],
      [3, 'upcoming'],
    ]);
  });

  it('keeps a round open through the last day of its games', () => {
    const placed = placeRounds([round(1, '2026-11-01', ['2026-11-08'])], '2026-11-08');
    expect(placed[0]?.phase).toBe('current');
  });

  it('has no current round when every dated round is over, and treats undated rounds as upcoming', () => {
    const placed = placeRounds([round(1, '2026-01-01'), round(2, null)], '2026-11-08');
    expect(placed.map((r) => r.phase)).toEqual(['past', 'upcoming']);
  });

  it('says nothing for an empty season', () => {
    expect(placeRounds([], '2026-11-08')).toEqual([]);
  });
});
