// Made-up leagues for the pairings and fairness report tests, and a way to lay pairings out
// as a schedule, one round a week, so the fairness report can read them.
import type { PairingRound, PairingTeam } from './pairing-types.ts';
import type { ScheduleGame, ScheduleRound, ScheduleState } from './schedule-types.ts';
import { seededNumbers } from './seeded-order.ts';

/** Teams named by single letters, all in one division (or none). */
export function teamsOf(ids: string, divisionId: string | null = null): PairingTeam[] {
  return ids.split('').map((id) => ({ id, divisionId }));
}

/** A small random source for the generated-input tests (T-182); a failing case reruns from its seed. */
export function randomFrom(seed: number): { int(below: number): number; chance(): boolean } {
  const next = seededNumbers(seed);
  return { int: (below) => Math.floor(next() * below), chance: () => next() < 0.5 };
}

/** A made-up league: 0 to 30 teams in up to four divisions, or none. */
export function randomTeams(seed: number): PairingTeam[] {
  const random = randomFrom(seed);
  const count = random.int(31);
  const divisions = random.int(5);
  return Array.from({ length: count }, (_, i) => ({
    id: `team-${i + 1}`,
    divisionId: divisions === 0 ? null : `division-${random.int(divisions) + 1}`,
  }));
}

/** Pairings laid out one round a week from 2026-10-04, every game at 18:00 on one court. */
export function pairingsAsSchedule(rounds: readonly PairingRound[]): ScheduleState {
  const scheduleRounds: ScheduleRound[] = [];
  const games: ScheduleGame[] = [];
  rounds.forEach((round, i) => {
    const date = weekAfter('2026-10-04', i);
    const roundId = `r${i + 1}`;
    scheduleRounds.push({ id: roundId, label: `Week ${i + 1}`, date });
    round.games.forEach((pairing, j) => {
      games.push({
        id: `${roundId}-g${j + 1}`,
        roundId,
        date,
        time: '18:00',
        venueId: 'v1',
        court: `Court ${j + 1}`,
        homeTeamId: pairing.homeTeamId,
        awayTeamId: pairing.awayTeamId,
        status: 'scheduled',
      });
    });
  });
  return { rounds: scheduleRounds, games };
}

function weekAfter(start: string, weeks: number): string {
  const t = new Date(`${start}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 7 * weeks);
  return t.toISOString().slice(0, 10);
}
