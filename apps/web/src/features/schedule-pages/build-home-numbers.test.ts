// The home page's four numbers, counted on the made-up stand-in schedule.
import { describe, expect, it } from 'vitest';
import { standInPublicSchedule } from '../../server/stand-in-public-schedule.ts';
import { standInPublicStats } from '../../server/stand-in-public-stats.ts';
import { buildHomeNumbers } from './build-home-numbers.ts';

const adult = '01900000-0000-7000-8000-000000000001';
const youth = '01900000-0000-7000-8000-000000000002';
const now = () => new Date('2026-11-13T15:00:00Z');
const schedules = standInPublicSchedule({ adultLeagueId: adult, youthLeagueId: youth }, now);
const stats = standInPublicStats({ adultLeagueId: adult, youthLeagueId: youth });

describe('the home page in numbers', () => {
  it('counts teams, games played, games to play and rounds', async () => {
    const season = (await stats.seasonsOf(adult))[0];
    if (season === undefined) throw new Error('no season');
    const clock = await schedules.clockOf(adult);
    const schedule = await schedules.scheduleOf(adult, season.id, clock.today);
    if (schedule === undefined) throw new Error('no schedule');
    const games = [...schedule.rounds.flatMap((r) => r.games), ...schedule.unplacedGames];
    const numbers = buildHomeNumbers(schedule, 5);
    expect(numbers.map((n) => n.key)).toEqual(['teams', 'played', 'toPlay', 'rounds']);
    const value = (key: string) => Number(numbers.find((n) => n.key === key)?.value);
    expect(value('teams')).toBe(5);
    expect(value('rounds')).toBe(schedule.rounds.length);
    expect(value('played')).toBeGreaterThan(0);
    expect(value('toPlay')).toBeGreaterThan(0);
    // A cancelled game is neither played nor still to play; every other game is one or the other.
    const cancelled = games.filter((g) => g.status === 'cancelled').length;
    expect(value('played') + value('toPlay')).toBe(games.length - cancelled);
    expect(numbers.every((n) => n.label.trim() !== '')).toBe(true);
  });
});
