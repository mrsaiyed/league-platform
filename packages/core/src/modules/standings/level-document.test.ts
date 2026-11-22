// The stored document of how level teams were ordered (step 2.198): what the engine says
// comes back whole, and anything else is read as "not known", never half-read.
import { calculateStandings, type StandingsRow } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import { levelDocument, readLevel } from './level-document.ts';

/** Case 46's West: Lions, Tigers, Hawks and Bears all 1-1. */
function west(): readonly StandingsRow[] {
  const games = [
    ['tigers', 55, 'hawks', 48],
    ['bears', 60, 'badgers', 52],
    ['hawks', 51, 'tigers', 47],
    ['otters', 58, 'lions', 49],
    ['lions', 50, 'bears', 44],
  ] as const;
  const result = calculateStandings({
    teams: ['otters', 'lions', 'tigers', 'hawks', 'bears', 'badgers'].map((teamId) => ({
      teamId,
      divisionId: null,
    })),
    games: games.map(([home, homeScore, away, awayScore], n) => ({
      gameId: `g${n}`,
      status: 'final',
      homeTeamId: home,
      awayTeamId: away,
      homeScore,
      awayScore,
      winnerTeamId: null,
      startsAt: new Date(Date.UTC(2026, 8, 1 + n)).toISOString(),
    })),
    rules: {
      standings: { rankBy: 'win-percentage', pointsPerWin: 2, pointsPerTie: 1, pointsPerLoss: 0 },
      tiebreakers: ['head-to-head', 'point-difference', 'points-scored'],
      allowTies: false,
      forfeit: { winnerScore: 20, loserScore: 0, countsInPointDifference: false },
    },
  });
  return result.tables.flatMap((table) => table.rows);
}

describe('the level document', () => {
  it('reads back exactly what the engine said, through JSON as a database keeps it', () => {
    const rows = west();
    for (const row of rows) {
      const stored: unknown = JSON.parse(JSON.stringify(levelDocument(row.level)));
      expect(readLevel(stored)).toEqual(row.level);
    }
    expect(rows.filter((row) => row.level !== null)).toHaveLength(4);
    expect(levelDocument(null)).toBeNull();
    expect(readLevel(null)).toBeNull();
  });

  it('reads as not known anything that is not the whole document', () => {
    const lions = west().find((row) => row.teamId === 'lions');
    const good = JSON.parse(JSON.stringify(levelDocument(lions?.level ?? null)));
    expect(readLevel(good)).not.toBeNull();
    const broken: unknown[] = [
      'level',
      [],
      { ...good, version: 2 },
      { ...good, teamIds: ['lions'] },
      { ...good, teamIds: ['lions', 'lions'] },
      { ...good, teamIds: 'lions' },
      { ...good, steps: [{ ...good.steps[0], tiebreaker: 'record' }] },
      { ...good, steps: [{ ...good.steps[0], applied: 'yes' }] },
      // A team not among the level teams, a place of 0, a place going down.
      {
        ...good,
        steps: [
          {
            ...good.steps[0],
            teams: [
              ...good.steps[0].teams.slice(0, 3),
              { teamId: 'owls', place: 4, value: null, record: { wins: 0, losses: 1, ties: 0 } },
            ],
          },
        ],
      },
      {
        ...good,
        steps: [
          {
            ...good.steps[0],
            teams: good.steps[0].teams.map((t: object) => ({ ...t, place: 0 })),
          },
        ],
      },
      {
        ...good,
        steps: [{ ...good.steps[0], teams: [...good.steps[0].teams].reverse() }],
      },
      // Head-to-head without a record; a record that is not counts.
      {
        ...good,
        steps: [
          {
            ...good.steps[0],
            teams: good.steps[0].teams.map((t: object) => ({ ...t, record: null })),
          },
        ],
      },
      {
        ...good,
        steps: [
          {
            ...good.steps[0],
            teams: good.steps[0].teams.map((t: object) => ({
              ...t,
              record: { wins: -1, losses: 0, ties: 0 },
            })),
          },
        ],
      },
    ];
    for (const value of broken) expect(readLevel(value)).toBeNull();
  });
});
