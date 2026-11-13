import { describe, expect, it } from 'vitest';
import type { CountedGame } from './count-games.ts';
import { teamRecord } from './team-records.ts';
import type { StandingsRules } from './types.ts';

const rules: StandingsRules = {
  standings: { rankBy: 'points', pointsPerWin: 2, pointsPerTie: 1, pointsPerLoss: 0 },
  tiebreakers: [],
  allowTies: true,
  forfeit: { winnerScore: 20, loserScore: 0, countsInPointDifference: false },
};

const played = (
  gameId: string,
  day: number,
  winnerTeamId: string | null,
  points: CountedGame['points'] = { home: 10, away: 8 },
): CountedGame => ({
  gameId,
  time: Date.UTC(2026, 0, day, 18),
  homeTeamId: 'a',
  awayTeamId: 'b',
  winnerTeamId,
  points,
});

describe('teamRecord', () => {
  it('counts the streak from the latest game back, by start time whatever the input order', () => {
    const games = [played('g3', 3, 'a'), played('g1', 1, 'b'), played('g2', 2, 'a')];
    expect(teamRecord('a', games, [], rules).record.streak).toEqual({ result: 'won', length: 2 });
    expect(teamRecord('b', games, [], rules).record.streak).toEqual({ result: 'lost', length: 2 });
  });

  it('adds adjustments to the record and points, not to games played or points for and against', () => {
    const { record, problems } = teamRecord(
      'a',
      [played('g1', 1, 'a'), played('g2', 2, null, null)],
      [
        { adjustmentId: 'x2', teamId: 'a', points: -1, reason: 'Late roster' },
        { adjustmentId: 'x1', teamId: 'a', wins: 1, reason: 'Ruling' },
        { adjustmentId: 'x3', teamId: 'b', wins: 5, reason: 'Not this team' },
      ],
      rules,
    );
    expect(problems).toEqual([]);
    expect(record).toEqual({
      teamId: 'a',
      gamesPlayed: 2,
      wins: 2,
      losses: 0,
      ties: 1,
      pointsFor: 10,
      pointsAgainst: 8,
      points: 2 * 2 + 1 - 1,
      streak: { result: 'tied', length: 1 },
      adjustments: [
        { adjustmentId: 'x1', reason: 'Ruling' },
        { adjustmentId: 'x2', reason: 'Late roster' },
      ],
    });
  });

  it('leaves out every adjustment that lowers a count taken below zero, in any order', () => {
    const adjustments = [
      { adjustmentId: 'y1', teamId: 'a', wins: -1, reason: 'One win taken away' },
      { adjustmentId: 'y2', teamId: 'a', wins: -1, losses: 1, reason: 'Overturned' },
      { adjustmentId: 'y3', teamId: 'a', ties: 1, reason: 'Tie by ruling' },
    ];
    const games = [played('g1', 1, 'a')];
    const one = teamRecord('a', games, adjustments, rules);
    const other = teamRecord('a', games, [...adjustments].reverse(), rules);
    expect(other).toEqual(one);
    // One win, two adjustments each taking one away: both go, the tie stays.
    expect(one.record).toMatchObject({ wins: 1, losses: 0, ties: 1 });
    expect(one.problems.map((p) => [p.id, p.reason])).toEqual([
      ['y1', 'adjustment-makes-count-negative'],
      ['y2', 'adjustment-makes-count-negative'],
    ]);
  });

  it('has no standings points when the season ranks by win percentage', () => {
    const pct: StandingsRules = {
      ...rules,
      standings: { ...rules.standings, rankBy: 'win-percentage' },
    };
    expect(teamRecord('a', [], [], pct).record).toMatchObject({
      points: null,
      streak: null,
      wins: 0,
      gamesPlayed: 0,
    });
  });
});
