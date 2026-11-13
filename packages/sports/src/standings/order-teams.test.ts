import { describe, expect, it } from 'vitest';
import type { CountedGame } from './count-games.ts';
import { orderTeams, type OrderContext } from './order-teams.ts';
import { teamRecord } from './team-records.ts';
import type { StandingsRules } from './types.ts';

let day = 0;
const game = (
  gameId: string,
  home: string,
  homeScore: number,
  away: string,
  awayScore: number,
): CountedGame => ({
  gameId,
  time: Date.UTC(2026, 0, ++day, 18),
  homeTeamId: home,
  awayTeamId: away,
  winnerTeamId: homeScore > awayScore ? home : awayScore > homeScore ? away : null,
  points: { home: homeScore, away: awayScore },
});
const win = (gameId: string, winner: string, loser: string): CountedGame =>
  game(gameId, winner, 2, loser, 1);

function context(
  teamIds: readonly string[],
  games: readonly CountedGame[],
  rules: StandingsRules,
  coinFlips: OrderContext['coinFlips'] = [],
): OrderContext {
  const records = new Map(
    teamIds.map((id) => [id, teamRecord(id, games, [], rules).record] as const),
  );
  return { records, games, rules, coinFlips };
}

const rules: StandingsRules = {
  standings: { rankBy: 'win-percentage', pointsPerWin: 2, pointsPerTie: 1, pointsPerLoss: 0 },
  tiebreakers: ['head-to-head', 'coin-flip'],
  allowTies: false,
  forfeit: { winnerScore: 20, loserScore: 0, countsInPointDifference: false },
};

describe('orderTeams', () => {
  it('passes over head-to-head when one of the level teams has not met the others', () => {
    // a, b and c are all 1-1; c never played a or b, so head-to-head cannot apply.
    const games = [
      win('g1', 'a', 'b'),
      win('g2', 'b', 'a'),
      win('g3', 'c', 'd'),
      win('g4', 'e', 'c'),
    ];
    const ids = ['a', 'b', 'c', 'd', 'e'];
    expect(orderTeams(ids, context(ids, games, rules))).toEqual([
      { teamIds: ['e'], decidedBy: null },
      { teamIds: ['a', 'b', 'c'], decidedBy: 'still-tied' },
      { teamIds: ['d'], decidedBy: null },
    ]);
  });

  it('starts again from the first tiebreaker for teams a later one leaves level', () => {
    // a, b and c go round in a circle, so head-to-head cannot split the three.
    // Point difference: a +28, b 0, c 0. Starting again for b and c, head-to-head
    // between just them puts b ahead, though points scored (c 162, b 135) would not.
    const games = [
      game('g1', 'a', 50, 'b', 40),
      game('g2', 'b', 45, 'c', 40),
      game('g3', 'c', 52, 'a', 50),
      game('g4', 'a', 60, 'd', 40),
      game('g5', 'b', 50, 'd', 45),
      game('g6', 'c', 70, 'd', 67),
    ];
    const ids = ['a', 'b', 'c', 'd'];
    const order: StandingsRules = {
      ...rules,
      tiebreakers: ['head-to-head', 'point-difference', 'points-scored'],
    };
    expect(orderTeams(ids, context(ids, games, order))).toEqual([
      { teamIds: ['a'], decidedBy: 'point-difference' },
      { teamIds: ['b'], decidedBy: 'head-to-head' },
      { teamIds: ['c'], decidedBy: 'head-to-head' },
      { teamIds: ['d'], decidedBy: null },
    ]);
  });

  it('uses the latest recorded coin flip that covers all the level teams', () => {
    const games = [win('g1', 'a', 'b'), win('g2', 'b', 'a')];
    const ids = ['a', 'b'];
    const flips = [
      ['b', 'a'],
      ['a', 'b', 'c'],
      ['b', 'c'],
    ];
    expect(orderTeams(ids, context(ids, games, rules, flips))).toEqual([
      { teamIds: ['a'], decidedBy: 'coin-flip' },
      { teamIds: ['b'], decidedBy: 'coin-flip' },
    ]);
  });

  it('in a points table, compares head-to-head by points per game in those games', () => {
    const points: StandingsRules = {
      ...rules,
      standings: { rankBy: 'points', pointsPerWin: 3, pointsPerTie: 1, pointsPerLoss: 0 },
      tiebreakers: ['head-to-head'],
    };
    // a and b both have 3 points; a beat b.
    const games = [win('g1', 'a', 'b'), win('g2', 'b', 'c')];
    const ids = ['a', 'b', 'c'];
    expect(orderTeams(ids, context(ids, games, points))).toEqual([
      { teamIds: ['a'], decidedBy: 'head-to-head' },
      { teamIds: ['b'], decidedBy: 'head-to-head' },
      { teamIds: ['c'], decidedBy: null },
    ]);
  });
});
