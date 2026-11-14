import type { StandingsRow } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { whatWouldMove } from './what-would-move.ts';

const row = (teamId: string, rank: number, fields: Partial<StandingsRow> = {}): StandingsRow => ({
  teamId,
  divisionId: null,
  rank,
  seed: rank,
  gamesPlayed: 2,
  wins: 1,
  losses: 1,
  ties: 0,
  pointsFor: 100,
  pointsAgainst: 100,
  pointDifference: 0,
  winPercentage: 0.5,
  points: null,
  streak: null,
  decidedBy: null,
  adjustments: [],
  ...fields,
});

describe('whatWouldMove', () => {
  it('lists only the teams something changes for, with each value before and after', () => {
    const now = [row('a', 1), row('b', 2), row('c', 3, { pointDifference: 4 })];
    const after = [
      row('a', 1, { decidedBy: 'head-to-head' }),
      row('b', 3),
      row('c', 2, { pointDifference: 9, pointsFor: 105 }),
    ];
    expect(whatWouldMove(now, after)).toEqual([
      {
        teamId: 'b',
        divisionId: null,
        changes: [
          { field: 'rank', from: 2, to: 3 },
          { field: 'seed', from: 2, to: 3 },
        ],
      },
      {
        teamId: 'c',
        divisionId: null,
        changes: [
          { field: 'rank', from: 3, to: 2 },
          { field: 'seed', from: 3, to: 2 },
          { field: 'pointsFor', from: 100, to: 105 },
          { field: 'pointDifference', from: 4, to: 9 },
        ],
      },
    ]);
  });

  it('lists nobody when the tables are the same', () => {
    expect(whatWouldMove([row('a', 1)], [row('a', 1)])).toEqual([]);
  });
});
