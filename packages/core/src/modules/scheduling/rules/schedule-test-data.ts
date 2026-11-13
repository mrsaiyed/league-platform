// Made-up schedule used by the scheduling rule tests.
import type { ScheduleGame, ScheduleState } from './schedule-types.ts';

export function game(id: string, over: Partial<ScheduleGame> = {}): ScheduleGame {
  return {
    id,
    roundId: 'r1',
    date: '2026-10-04',
    time: '18:00',
    venueId: 'v1',
    court: 'Court 1',
    homeTeamId: 'a',
    awayTeamId: 'b',
    status: 'scheduled',
    ...over,
  };
}

export function baseState(): ScheduleState {
  return {
    rounds: [
      { id: 'r1', label: 'Week 1', date: '2026-10-04' },
      { id: 'r2', label: 'Week 2', date: '2026-10-11' },
    ],
    games: [
      game('g1'),
      game('g2', { homeTeamId: 'c', awayTeamId: 'd', time: '19:00' }),
      game('g3', { roundId: 'r2', date: '2026-10-11', homeTeamId: 'a', awayTeamId: 'c' }),
    ],
  };
}
