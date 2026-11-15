// The home page's four numbers, counted on the made-up stand-in schedule.
import { describe, expect, it } from 'vitest';
import { standInPublicSchedule } from '../../server/stand-in-public-schedule.ts';
import { standInPublicStats } from '../../server/stand-in-public-stats.ts';
import { startingNamePolicy } from '../../server/name-policy-of.ts';
import { testWorld } from '../../server/stand-in-world.test-helper.ts';
import { buildHomeNumbers } from './build-home-numbers.ts';

const adult = '01900000-0000-7000-8000-000000000001';
const now = () => new Date('2026-11-13T15:00:00Z');
const world = testWorld(undefined, now);
const schedules = standInPublicSchedule(world);
const stats = standInPublicStats(world, startingNamePolicy);

describe('the home page in numbers', () => {
  it('counts teams, games played, games to play and rounds', async () => {
    const season = (await stats.seasonsOf(adult))[0];
    if (season === undefined) throw new Error('no season');
    const clock = await schedules.clockOf(adult);
    const schedule = await schedules.scheduleOf(adult, season.id, clock.today);
    if (schedule === undefined) throw new Error('no schedule');
    const games = [...schedule.rounds.flatMap((r) => r.games), ...schedule.unplacedGames];
    const numbers = buildHomeNumbers(schedule, 9);
    expect(numbers.map((n) => n.key)).toEqual(['teams', 'played', 'toPlay', 'rounds']);
    const value = (key: string) => Number(numbers.find((n) => n.key === key)?.value);
    expect(value('teams')).toBe(9);
    expect(value('rounds')).toBe(schedule.rounds.length);
    expect(value('played')).toBeGreaterThan(0);
    expect(value('toPlay')).toBeGreaterThan(0);
    // A cancelled game is neither played nor still to play; every other game is one or the other.
    const cancelled = games.filter((g) => g.status === 'cancelled').length;
    expect(value('played') + value('toPlay')).toBe(games.length - cancelled);
    expect(numbers.every((n) => n.label.trim() !== '')).toBe(true);
  });

  it('shows the points scored, not "0 games to play", once a season has none left', async () => {
    const season = (await stats.seasonsOf(adult))[0];
    if (season === undefined) throw new Error('no season');
    const clock = await schedules.clockOf(adult);
    const schedule = await schedules.scheduleOf(adult, season.id, clock.today);
    if (schedule === undefined) throw new Error('no schedule');
    // The same season with every game decided 50 to 40.
    const finished = {
      ...schedule,
      rounds: schedule.rounds.map((round) => ({
        ...round,
        games: round.games.map((g) => ({ ...g, status: 'final', homeScore: 50, awayScore: 40 })),
      })),
      unplacedGames: [],
    };
    const games = finished.rounds.flatMap((r) => r.games);
    const numbers = buildHomeNumbers(finished, 9);
    expect(numbers.map((n) => n.key)).toEqual(['teams', 'played', 'scored', 'rounds']);
    const value = (key: string) => numbers.find((n) => n.key === key)?.value;
    expect(value('played')).toBe(String(games.length));
    expect(value('scored')).toBe(new Intl.NumberFormat('en').format(games.length * 90));
    expect(numbers.every((n) => n.label.trim() !== '' && n.value !== '0')).toBe(true);
  });

  it('keeps "games to play" on a season nobody has scored in yet', async () => {
    const season = (await stats.seasonsOf(adult))[0];
    if (season === undefined) throw new Error('no season');
    const clock = await schedules.clockOf(adult);
    const schedule = await schedules.scheduleOf(adult, season.id, clock.today);
    if (schedule === undefined) throw new Error('no schedule');
    const empty = { ...schedule, rounds: [], unplacedGames: [] };
    expect(buildHomeNumbers(empty, 0).map((n) => n.key)).toEqual([
      'teams',
      'played',
      'toPlay',
      'rounds',
    ]);
  });
});
