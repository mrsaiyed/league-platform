// Worked examples for standings (P7 §1, §5.6 and §6; S-9, S-10, S-11).
import { describe, expect, it } from 'vitest';
import { calculateStandings } from './calculate-standings.ts';
import type {
  StandingsGame,
  StandingsInput,
  StandingsResult,
  StandingsRow,
  StandingsRules,
} from './types.ts';

// The basketball defaults of P7 §1.
const rules: StandingsRules = {
  standings: { rankBy: 'win-percentage', pointsPerWin: 2, pointsPerTie: 1, pointsPerLoss: 0 },
  tiebreakers: ['head-to-head', 'point-difference', 'points-scored'],
  allowTies: false,
  forfeit: { winnerScore: 20, loserScore: 0, countsInPointDifference: false },
};

const pointsRules: StandingsRules = {
  ...rules,
  standings: { rankBy: 'points', pointsPerWin: 3, pointsPerTie: 1, pointsPerLoss: 0 },
  allowTies: true,
};

let day = 0;
function final(
  gameId: string,
  homeTeamId: string,
  homeScore: number,
  awayTeamId: string,
  awayScore: number,
): StandingsGame {
  day++;
  return {
    gameId,
    status: 'final',
    homeTeamId,
    awayTeamId,
    homeScore,
    awayScore,
    winnerTeamId: null,
    startsAt: new Date(Date.UTC(2026, 0, day, 18)).toISOString(),
  };
}

function teams(...ids: string[]): StandingsInput['teams'] {
  return ids.map((teamId) => ({ teamId, divisionId: null }));
}

function only(result: StandingsResult): readonly StandingsRow[] {
  expect(result.tables).toHaveLength(1);
  const table = result.tables[0];
  if (!table) throw new Error('no table');
  return table.rows;
}

function summary(rows: readonly StandingsRow[]): string[] {
  return rows.map(
    (row) =>
      `${row.rank}/${row.seed} ${row.teamId} ${row.wins}-${row.losses}-${row.ties} ` +
      `${row.decidedBy ?? '-'}`,
  );
}

describe('standings: worked examples', () => {
  it('builds a table with record, points for and against, streak and head-to-head', () => {
    const rows = only(
      calculateStandings({
        teams: teams('a', 'b', 'c', 'd'),
        rules,
        games: [
          final('g1', 'a', 50, 'b', 40),
          final('g2', 'c', 45, 'd', 44),
          final('g3', 'a', 60, 'c', 50),
          final('g4', 'b', 55, 'd', 30),
          final('g5', 'a', 40, 'd', 42),
          final('g6', 'b', 48, 'c', 47),
        ],
      }),
    );
    expect(summary(rows)).toEqual([
      '1/1 a 2-1-0 head-to-head',
      '2/2 b 2-1-0 head-to-head',
      '3/3 c 1-2-0 head-to-head',
      '4/4 d 1-2-0 head-to-head',
    ]);
    expect(rows[0]).toMatchObject({
      gamesPlayed: 3,
      pointsFor: 150,
      pointsAgainst: 132,
      pointDifference: 18,
      points: null,
      streak: { result: 'lost', length: 1 },
      adjustments: [],
    });
    expect(rows[0]?.winPercentage).toBeCloseTo(2 / 3);
    expect(rows[1]).toMatchObject({ pointsFor: 143, pointsAgainst: 127 });
    expect(rows[1]?.streak).toEqual({ result: 'won', length: 2 });
  });

  it('breaks a three-way tie where head-to-head goes round in a circle by point difference', () => {
    // a beat b, b beat c, c beat a: each is 1-1 among the three, so head-to-head
    // cannot split them and point difference decides.
    const rows = only(
      calculateStandings({
        teams: teams('a', 'b', 'c', 'd'),
        rules,
        games: [
          final('g1', 'a', 50, 'b', 40),
          final('g2', 'b', 45, 'c', 44),
          final('g3', 'c', 60, 'a', 50),
          final('g4', 'a', 70, 'd', 50),
          final('g5', 'b', 60, 'd', 55),
          final('g6', 'c', 50, 'd', 48),
        ],
      }),
    );
    expect(summary(rows)).toEqual([
      '1/1 a 2-1-0 point-difference',
      '2/2 c 2-1-0 point-difference',
      '3/3 b 2-1-0 point-difference',
      '4/4 d 0-3-0 -',
    ]);
    expect(rows.map((row) => row.pointDifference)).toEqual([20, 11, -4, -27]);
  });

  it('separates one team of a three-way tie by head-to-head, then starts again for the other two', () => {
    // Among a, b and c: a is 2-0, b and c are 1-2. Between b and c alone it is
    // 1-1, so head-to-head still cannot split them and point difference does.
    const rows = only(
      calculateStandings({
        teams: teams('a', 'b', 'c', 'd', 'e'),
        rules,
        games: [
          final('g1', 'a', 50, 'b', 40),
          final('g2', 'a', 52, 'c', 41),
          final('g3', 'b', 45, 'c', 40),
          final('g4', 'c', 48, 'b', 46),
          final('g5', 'd', 60, 'a', 50),
          final('g6', 'd', 55, 'a', 54),
          final('g7', 'b', 50, 'd', 49),
          final('g8', 'c', 60, 'd', 40),
          final('g9', 'd', 50, 'e', 30),
          final('g10', 'd', 51, 'e', 31),
        ],
      }),
    );
    expect(summary(rows)).toEqual([
      '1/1 d 4-2-0 -',
      '2/2 a 2-2-0 head-to-head',
      '3/3 c 2-2-0 point-difference',
      '4/4 b 2-2-0 point-difference',
      '5/5 e 0-2-0 -',
    ]);
    // Worked by hand: c scored 41+40+48+60 = 189 and allowed 52+45+46+40 = 183.
    expect(rows.map((row) => [row.teamId, row.pointDifference])).toEqual([
      ['d', 30],
      ['a', 10],
      ['c', 6],
      ['b', -6],
      ['e', -40],
    ]);
  });

  it('follows the admin’s order of tiebreakers', () => {
    // p and q never met and have the same point difference; p scored more, q allowed fewer.
    const input = (tiebreakers: StandingsRules['tiebreakers']): StandingsInput => ({
      teams: teams('p', 'q', 'r', 's'),
      rules: { ...rules, tiebreakers },
      games: [final('g1', 'p', 100, 'r', 90), final('g2', 'q', 80, 's', 70)],
    });
    const top = (tiebreakers: StandingsRules['tiebreakers']): string[] =>
      summary(only(calculateStandings(input(tiebreakers))).slice(0, 2));
    expect(top(['head-to-head', 'point-difference', 'points-scored'])).toEqual([
      '1/1 p 1-0-0 points-scored',
      '2/2 q 1-0-0 points-scored',
    ]);
    expect(top(['fewest-points-allowed', 'points-scored'])).toEqual([
      '1/1 q 1-0-0 fewest-points-allowed',
      '2/2 p 1-0-0 fewest-points-allowed',
    ]);
  });

  it('ranks by points per win, tie and loss, with adjustments and their reasons', () => {
    const games = [
      final('g1', 'x', 40, 'y', 40),
      final('g2', 'x', 50, 'z', 45),
      final('g3', 'y', 60, 'z', 30),
    ];
    const before = only(
      calculateStandings({ teams: teams('x', 'y', 'z'), rules: pointsRules, games }),
    );
    expect(summary(before)).toEqual([
      '1/1 y 1-0-1 point-difference',
      '2/2 x 1-0-1 point-difference',
      '3/3 z 0-2-0 -',
    ]);
    expect(before.map((row) => row.points)).toEqual([4, 4, 0]);

    const after = only(
      calculateStandings({
        teams: teams('x', 'y', 'z'),
        rules: pointsRules,
        games,
        adjustments: [
          { adjustmentId: 'adj-1', teamId: 'x', points: -2, reason: 'Played an ineligible player' },
          { adjustmentId: 'adj-2', teamId: 'z', wins: 1, reason: 'Forfeit win awarded by ruling' },
        ],
      }),
    );
    expect(summary(after)).toEqual(['1/1 y 1-0-1 -', '2/2 z 1-2-0 -', '3/3 x 1-0-1 -']);
    expect(after.map((row) => row.points)).toEqual([4, 3, 2]);
    expect(after[1]).toMatchObject({
      // Games played counts games actually played; the awarded win is not one.
      gamesPlayed: 2,
      pointsFor: 75,
      streak: { result: 'lost', length: 2 },
      adjustments: [{ adjustmentId: 'adj-2', reason: 'Forfeit win awarded by ruling' }],
    });
    expect(after[2]?.adjustments).toEqual([
      { adjustmentId: 'adj-1', reason: 'Played an ineligible player' },
    ]);
  });

  it('records a forfeit at the league’s score, in point difference only when the season says so', () => {
    const forfeit: StandingsGame = {
      ...final('g1', 'a', 2, 'b', 0),
      status: 'forfeit',
      winnerTeamId: 'b',
    };
    const input: StandingsInput = { teams: teams('a', 'b'), rules, games: [forfeit] };

    const notCounted = only(calculateStandings(input));
    expect(summary(notCounted)).toEqual(['1/1 b 1-0-0 -', '2/2 a 0-1-0 -']);
    expect(notCounted.map((row) => [row.pointsFor, row.pointsAgainst])).toEqual([
      [0, 0],
      [0, 0],
    ]);

    const counted = only(
      calculateStandings({
        ...input,
        rules: { ...rules, forfeit: { ...rules.forfeit, countsInPointDifference: true } },
      }),
    );
    expect(counted.map((row) => [row.teamId, row.pointsFor, row.pointsAgainst])).toEqual([
      ['b', 20, 0],
      ['a', 0, 20],
    ]);
  });

  it('counts cancelled, postponed, scheduled and live games for nothing', () => {
    const games = [final('g1', 'a', 50, 'b', 40)];
    const base = calculateStandings({ teams: teams('a', 'b', 'c'), rules, games });
    const others = (['cancelled', 'postponed', 'scheduled', 'live'] as const).map(
      (status, i): StandingsGame => ({ ...final(`x${i}`, 'b', 70, 'c', 10), status }),
    );
    const withOthers = calculateStandings({
      teams: teams('a', 'b', 'c'),
      rules,
      games: [...others, ...games],
    });
    expect(withOthers).toEqual(base);
    expect(only(base).find((row) => row.teamId === 'c')).toMatchObject({
      teamId: 'c',
      gamesPlayed: 0,
      winPercentage: 0,
      streak: null,
    });
  });

  it('leaves teams level when nothing separates them, until the admin records a coin flip', () => {
    // a and b never met and have identical records, so head-to-head cannot apply.
    const input: StandingsInput = {
      teams: teams('a', 'b', 'c', 'd'),
      rules: { ...rules, tiebreakers: ['head-to-head', 'point-difference', 'coin-flip'] },
      games: [final('g1', 'b', 50, 'c', 40), final('g2', 'a', 50, 'd', 40)],
    };
    expect(summary(only(calculateStandings(input))).slice(0, 2)).toEqual([
      '1/1 a 1-0-0 still-tied',
      '1/2 b 1-0-0 still-tied',
    ]);
    const flipped = calculateStandings({
      ...input,
      coinFlips: [
        ['a', 'b'],
        ['b', 'a'],
      ],
    });
    expect(summary(only(flipped)).slice(0, 2)).toEqual([
      '1/1 b 1-0-0 coin-flip',
      '2/2 a 1-0-0 coin-flip',
    ]);
    // A flip recorded but not in the admin's list does nothing.
    const unused = calculateStandings({
      ...input,
      rules: { ...rules, tiebreakers: ['point-difference'] },
      coinFlips: [['b', 'a']],
    });
    expect(summary(only(unused)).slice(0, 2)).toEqual([
      '1/1 a 1-0-0 still-tied',
      '1/2 b 1-0-0 still-tied',
    ]);
  });

  it('gives each division its own table and seeds, counting games across divisions for both teams', () => {
    const result = calculateStandings({
      teams: [
        { teamId: 'e1', divisionId: 'east' },
        { teamId: 'e2', divisionId: 'east' },
        { teamId: 'w1', divisionId: 'west' },
        { teamId: 'w2', divisionId: 'west' },
      ],
      rules,
      games: [
        final('g1', 'e1', 50, 'w1', 40),
        final('g2', 'w2', 50, 'e2', 40),
        final('g3', 'e2', 50, 'e1', 40),
      ],
    });
    // e1 and e2 are both 1-1; e2 won the game between them.
    expect(result.tables.map((table) => [table.divisionId, summary(table.rows)])).toEqual([
      ['east', ['1/1 e2 1-1-0 head-to-head', '2/2 e1 1-1-0 head-to-head']],
      ['west', ['1/1 w2 1-0-0 -', '2/2 w1 0-1-0 -']],
    ]);
  });

  it('reports games and adjustments it cannot count, and leaves them out', () => {
    const missing: StandingsGame = { ...final('g2', 'a', 50, 'b', 40), awayScore: null };
    const noWinner: StandingsGame = { ...final('g3', 'a', 0, 'b', 0), status: 'forfeit' };
    const wrongWinner: StandingsGame = {
      ...final('g4', 'a', 0, 'b', 0),
      status: 'forfeit',
      winnerTeamId: 'c',
    };
    const result = calculateStandings({
      teams: [...teams('a', 'b', 'c'), { teamId: 'c', divisionId: 'other' }],
      rules,
      games: [
        final('g1', 'a', 50, 'b', 40),
        missing,
        noWinner,
        wrongWinner,
        final('g5', 'a', 50, 'zz', 40),
        final('g6', 'a', 50, 'a', 40),
        final('g7', 'b', 50, 'a', 40),
        final('g7', 'a', 50, 'b', 40),
        final('g8', 'a', 50, 'c', 40),
      ],
      adjustments: [{ adjustmentId: 'adj-1', teamId: 'zz', wins: 1, reason: 'Ruling' }],
    });
    expect(result.problems).toEqual([
      { kind: 'adjustment', id: 'adj-1', reason: 'unknown-team', leftOut: true },
      { kind: 'game', id: 'g2', reason: 'missing-score', leftOut: true },
      { kind: 'game', id: 'g3', reason: 'forfeit-without-winner', leftOut: true },
      { kind: 'game', id: 'g4', reason: 'winner-not-in-game', leftOut: true },
      { kind: 'game', id: 'g5', reason: 'unknown-team', leftOut: true },
      { kind: 'game', id: 'g6', reason: 'same-team-twice', leftOut: true },
      { kind: 'game', id: 'g7', reason: 'duplicate-game-id', leftOut: true },
      { kind: 'game', id: 'g8', reason: 'team-listed-twice', leftOut: true },
      { kind: 'team', id: 'c', reason: 'duplicate-team-id', leftOut: true },
    ]);
    expect(summary(only(result))).toEqual(['1/1 a 1-0-0 -', '2/2 b 0-1-0 -']);
  });

  it('starts the list again for the two teams still level: b beat c, so b goes ahead', () => {
    // a, b and c are 1-1 among themselves, so head-to-head cannot split the three.
    // Point difference puts a first and leaves b and c level at 0. Starting again,
    // head-to-head between b and c alone decides, though c scored more points.
    const rows = only(
      calculateStandings({
        teams: teams('a', 'b', 'c', 'd'),
        rules,
        games: [
          final('g1', 'a', 50, 'b', 40),
          final('g2', 'b', 45, 'c', 40),
          final('g3', 'c', 52, 'a', 50),
          final('g4', 'a', 60, 'd', 40),
          final('g5', 'b', 50, 'd', 45),
          final('g6', 'c', 70, 'd', 67),
        ],
      }),
    );
    expect(summary(rows)).toEqual([
      '1/1 a 2-1-0 point-difference',
      '2/2 b 2-1-0 head-to-head',
      '3/3 c 2-1-0 head-to-head',
      '4/4 d 0-3-0 -',
    ]);
    // Worked by hand: a 160-132, b 135-135, c 162-162, d 152-180.
    expect(rows.map((row) => [row.teamId, row.pointsFor, row.pointsAgainst])).toEqual([
      ['a', 160, 132],
      ['b', 135, 135],
      ['c', 162, 162],
      ['d', 152, 180],
    ]);
  });

  it('counts a forfeit in head-to-head and in the streak, even when it adds no points', () => {
    const games = [
      final('g1', 'b', 50, 'c', 40),
      final('g2', 'd', 50, 'a', 40),
      final('g3', 'd', 50, 'c', 40),
      { ...final('g4', 'b', 0, 'a', 0), status: 'forfeit', winnerTeamId: 'a' } as const,
    ];
    const rows = only(calculateStandings({ teams: teams('a', 'b', 'c', 'd'), rules, games }));
    // a and b are both 1-1; b has the better point difference (+10 against -10),
    // but a won the forfeit between them and head-to-head comes first.
    expect(summary(rows)).toEqual([
      '1/1 d 2-0-0 -',
      '2/2 a 1-1-0 head-to-head',
      '3/3 b 1-1-0 head-to-head',
      '4/4 c 0-2-0 -',
    ]);
    expect(rows.map((row) => [row.teamId, row.pointDifference, row.streak])).toEqual([
      ['d', 20, { result: 'won', length: 2 }],
      ['a', -10, { result: 'won', length: 1 }],
      ['b', 10, { result: 'lost', length: 1 }],
      ['c', -20, { result: 'lost', length: 2 }],
    ]);
  });

  it('in a points table, compares head-to-head by points per game, not points in total', () => {
    // a, b and c have 6 points each. Among themselves: b 6 points in 3 games (2 a
    // game), a 3 in 2 (1.5), c 3 in 3 (1). By totals a and c would be level, and c
    // beat a; per game, a is ahead.
    const rows = only(
      calculateStandings({
        teams: teams('a', 'b', 'c', 'd'),
        rules: { ...pointsRules, tiebreakers: ['head-to-head'] },
        games: [
          final('g1', 'a', 50, 'b', 40),
          final('g2', 'b', 50, 'c', 40),
          final('g3', 'c', 45, 'b', 50),
          final('g4', 'c', 50, 'a', 40),
          final('g5', 'a', 50, 'd', 40),
          final('g6', 'c', 50, 'd', 40),
          final('g7', 'd', 50, 'b', 40),
        ],
      }),
    );
    expect(summary(rows)).toEqual([
      '1/1 b 2-2-0 head-to-head',
      '2/2 a 2-1-0 head-to-head',
      '3/3 c 2-2-0 head-to-head',
      '4/4 d 1-2-0 -',
    ]);
    expect(rows.map((row) => row.points)).toEqual([6, 6, 6, 3]);
  });

  it('counts a tie the season does not allow, and reports it', () => {
    const games = [final('g1', 'a', 40, 'b', 40)];
    const off = calculateStandings({ teams: teams('a', 'b'), rules, games });
    expect(summary(only(off))).toEqual(['1/1 a 0-0-1 still-tied', '1/2 b 0-0-1 still-tied']);
    expect(off.problems).toEqual([
      { kind: 'game', id: 'g1', reason: 'tie-not-allowed', leftOut: false },
    ]);
    const on = calculateStandings({
      teams: teams('a', 'b'),
      rules: { ...rules, allowTies: true },
      games,
    });
    expect(on.problems).toEqual([]);
    expect(on.tables).toEqual(off.tables);
  });

  it('refuses scores that are not whole numbers of 0 or more', () => {
    const result = calculateStandings({
      teams: teams('a', 'b'),
      rules,
      games: [
        final('g1', 'a', Number.NaN, 'b', 40),
        final('g2', 'a', -3, 'b', 40),
        final('g3', 'a', 2.5, 'b', 40),
        final('g4', 'a', Number.POSITIVE_INFINITY, 'b', 40),
      ],
    });
    expect(result.problems.map((p) => [p.id, p.reason])).toEqual([
      ['g1', 'invalid-score'],
      ['g2', 'invalid-score'],
      ['g3', 'invalid-score'],
      ['g4', 'invalid-score'],
    ]);
    expect(only(result).every((row) => row.gamesPlayed === 0)).toBe(true);
  });

  it('counts a game whose start time cannot be read, reports it, and puts it first in time', () => {
    const lost: StandingsGame = { ...final('g1', 'a', 40, 'b', 50), startsAt: 'not a date' };
    const result = calculateStandings({
      teams: teams('a', 'b'),
      rules,
      games: [final('g2', 'a', 50, 'b', 40), lost],
    });
    expect(result.problems).toEqual([
      { kind: 'game', id: 'g1', reason: 'invalid-start-time', leftOut: false },
    ]);
    expect(only(result).find((row) => row.teamId === 'a')).toMatchObject({
      gamesPlayed: 2,
      wins: 1,
      losses: 1,
      streak: { result: 'won', length: 1 },
    });
  });

  it('applies an overturned result without changing games played', () => {
    const rows = only(
      calculateStandings({
        teams: teams('a', 'b'),
        rules,
        games: [final('g1', 'a', 50, 'b', 40)],
        adjustments: [
          { adjustmentId: 'r1', teamId: 'b', wins: 1, losses: -1, reason: 'Result overturned' },
          { adjustmentId: 'r2', teamId: 'a', wins: -1, losses: 1, reason: 'Result overturned' },
        ],
      }),
    );
    expect(summary(rows)).toEqual(['1/1 b 1-0-0 -', '2/2 a 0-1-0 -']);
    expect(rows.map((row) => [row.gamesPlayed, row.pointsFor, row.streak?.result])).toEqual([
      [1, 40, 'lost'],
      [1, 50, 'won'],
    ]);
  });

  it('leaves out adjustments that cannot apply, and reports each one', () => {
    const result = calculateStandings({
      teams: teams('a', 'b'),
      rules,
      games: [final('g1', 'a', 50, 'b', 40)],
      adjustments: [
        { adjustmentId: 'n1', teamId: 'a', wins: Number.NaN, reason: 'Bad number' },
        { adjustmentId: 'n2', teamId: 'a', wins: 0.5, reason: 'Half a win' },
        { adjustmentId: 'n3', teamId: 'b', losses: -2, reason: 'Below zero' },
        { adjustmentId: 'n4', teamId: 'a', points: -2, reason: 'Points in a percentage table' },
        { adjustmentId: 'n5', teamId: 'a', reason: 'Nothing at all' },
        { adjustmentId: 'n6', teamId: 'b', wins: 1, reason: 'Listed twice' },
        { adjustmentId: 'n6', teamId: 'b', wins: 1, reason: 'Listed twice' },
        { adjustmentId: 'n7', teamId: 'b', ties: 1, points: -1, reason: 'Tie by ruling' },
      ],
    });
    expect(result.problems).toEqual([
      { kind: 'adjustment', id: 'n1', reason: 'invalid-adjustment', leftOut: true },
      { kind: 'adjustment', id: 'n2', reason: 'invalid-adjustment', leftOut: true },
      { kind: 'adjustment', id: 'n3', reason: 'adjustment-makes-count-negative', leftOut: true },
      { kind: 'adjustment', id: 'n4', reason: 'adjustment-has-no-effect', leftOut: true },
      { kind: 'adjustment', id: 'n5', reason: 'adjustment-has-no-effect', leftOut: true },
      { kind: 'adjustment', id: 'n6', reason: 'duplicate-adjustment-id', leftOut: true },
      {
        kind: 'adjustment',
        id: 'n7',
        reason: 'points-ignored-in-win-percentage-season',
        leftOut: false,
      },
    ]);
    expect(
      only(result).map((row) => [row.teamId, row.wins, row.losses, row.ties, row.adjustments]),
    ).toEqual([
      ['a', 1, 0, 0, []],
      ['b', 0, 1, 1, [{ adjustmentId: 'n7', reason: 'Tie by ruling' }]],
    ]);
  });
});
