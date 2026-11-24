// The plain line beside a standings table or a team's record that leaves out a game being
// corrected (step 2.159, S-101, S-105).
import { describe, expect, it } from 'vitest';
import { standInPublicSchedule } from '../../server/stand-in-public-schedule.ts';
import { standInPublicStats } from '../../server/stand-in-public-stats.ts';
import { startingNamePolicy } from '../../server/name-policy-of.ts';
import { testWorld } from '../../server/stand-in-world.test-helper.ts';
import { beingCorrectedLine, countBeingCorrected } from './being-corrected-note.tsx';

const adult = '01900000-0000-7000-8000-000000000001';
const now = () => new Date('2026-11-13T15:00:00Z');
const world = testWorld(undefined, now);
const schedules = standInPublicSchedule(world);
const stats = standInPublicStats(world, startingNamePolicy);

describe('a game being corrected, beside the standings and a team’s record', () => {
  it('counts the games being corrected, of the season or of one team', async () => {
    const season = (await stats.seasonsOf(adult))[0];
    if (season === undefined) throw new Error('no season');
    const clock = await schedules.clockOf(adult);
    const schedule = await schedules.scheduleOf(adult, season.id, clock.today);
    if (schedule === undefined) throw new Error('no schedule');
    expect(countBeingCorrected(schedule, clock)).toBe(0);
    const firstRound = schedule.rounds.find((r) => r.games.length >= 2);
    if (firstRound === undefined) throw new Error('no round of two games');
    const [a, b] = firstRound.games;
    if (a === undefined || b === undefined) throw new Error('no games');
    const stood = { status: 'final', homeScore: 50, awayScore: 40 };
    const reopened = {
      ...schedule,
      rounds: schedule.rounds.map((round) =>
        round.id !== firstRound.id
          ? round
          : {
              ...round,
              games: round.games.map((g) =>
                g.id === a.id || g.id === b.id
                  ? { ...g, status: 'live', beingCorrected: stood }
                  : g,
              ),
            },
      ),
    };
    expect(countBeingCorrected(reopened, clock)).toBe(2);
    expect(countBeingCorrected(reopened, clock, a.homeTeam.slug)).toBe(
      a.homeTeam.slug === b.homeTeam.slug || a.homeTeam.slug === b.awayTeam.slug ? 2 : 1,
    );
    // A game that is only live is not being corrected.
    const live = {
      ...schedule,
      rounds: schedule.rounds.map((round) => ({
        ...round,
        games: round.games.map((g) => (g.id === a.id ? { ...g, status: 'live' } : g)),
      })),
    };
    expect(countBeingCorrected(live, clock)).toBe(0);
    expect(countBeingCorrected(undefined, clock)).toBe(0);
  });

  it('says so in one plain line, one game or many', () => {
    expect(beingCorrectedLine(1)).toBe(
      '1 game is being corrected and is not counted until it is finished again.',
    );
    expect(beingCorrectedLine(2)).toBe(
      '2 games are being corrected and are not counted until they are finished again.',
    );
  });
});
