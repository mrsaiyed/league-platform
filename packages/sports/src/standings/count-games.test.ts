import { describe, expect, it } from 'vitest';
import { compareGamesByTime, countGames, type CountedGame } from './count-games.ts';
import type { StandingsGame, StandingsRules } from './types.ts';

const rules: StandingsRules = {
  standings: { rankBy: 'win-percentage', pointsPerWin: 2, pointsPerTie: 1, pointsPerLoss: 0 },
  tiebreakers: [],
  allowTies: true,
  forfeit: { winnerScore: 20, loserScore: 0, countsInPointDifference: true },
};

const game = (gameId: string, change: Partial<StandingsGame> = {}): StandingsGame => ({
  gameId,
  status: 'final',
  homeTeamId: 'a',
  awayTeamId: 'b',
  homeScore: 50,
  awayScore: 40,
  winnerTeamId: null,
  startsAt: '2026-01-01T18:00:00.000Z',
  ...change,
});

const teams = { listed: new Set(['a', 'b']), duplicated: new Set(['c']) };

describe('countGames', () => {
  it('takes a final game’s winner from its score, and an equal score as a tie', () => {
    const { counted } = countGames(
      [game('g1'), game('g2', { homeScore: 40, awayScore: 41 }), game('g3', { awayScore: 50 })],
      teams,
      rules,
    );
    expect(counted.map((g) => g.winnerTeamId)).toEqual(['a', 'b', null]);
    expect(counted[0]).toMatchObject({
      points: { home: 50, away: 40 },
      time: Date.UTC(2026, 0, 1, 18),
    });
  });

  it('records a forfeit at the league’s score, or adds no points when it is not counted', () => {
    const forfeit = game('g1', {
      status: 'forfeit',
      homeScore: 3,
      awayScore: 1,
      winnerTeamId: 'b',
    });
    expect(countGames([forfeit], teams, rules).counted[0]).toMatchObject({
      winnerTeamId: 'b',
      points: { home: 0, away: 20 },
    });
    const notCounted = { ...rules, forfeit: { ...rules.forfeit, countsInPointDifference: false } };
    expect(countGames([forfeit], teams, notCounted).counted[0]?.points).toBeNull();
  });

  it('skips games that are not final or forfeit, without reporting them', () => {
    const statuses = ['scheduled', 'live', 'postponed', 'cancelled'] as const;
    const result = countGames(
      statuses.map((status, i) => game(`g${i}`, { status })),
      teams,
      rules,
    );
    expect(result).toEqual({ counted: [], problems: [] });
  });

  it('drops every copy of a game id that arrives twice, and games of a team listed twice', () => {
    const result = countGames(
      [game('g1'), game('g1', { status: 'cancelled' }), game('g2', { awayTeamId: 'c' })],
      teams,
      rules,
    );
    expect(result).toEqual({
      counted: [],
      problems: [
        { kind: 'game', id: 'g1', reason: 'duplicate-game-id', leftOut: true },
        { kind: 'game', id: 'g2', reason: 'team-listed-twice', leftOut: true },
      ],
    });
  });

  it('reports a tie when the season does not allow ties, and still counts it', () => {
    const result = countGames([game('g1', { awayScore: 50 })], teams, {
      ...rules,
      allowTies: false,
    });
    expect(result.counted).toHaveLength(1);
    expect(result.problems).toEqual([
      { kind: 'game', id: 'g1', reason: 'tie-not-allowed', leftOut: false },
    ]);
  });
});

describe('compareGamesByTime', () => {
  const at = (gameId: string, time: number | null): CountedGame => ({
    gameId,
    time,
    homeTeamId: 'a',
    awayTeamId: 'b',
    winnerTeamId: 'a',
    points: null,
  });

  it('orders by time, then id, with unreadable times first: one order whatever the input', () => {
    const games = [at('g4', 20), at('g2', null), at('g3', 10), at('g1', 10), at('g0', null)];
    const expected = ['g0', 'g2', 'g1', 'g3', 'g4'];
    expect([...games].sort(compareGamesByTime).map((g) => g.gameId)).toEqual(expected);
    expect(
      [...games]
        .reverse()
        .sort(compareGamesByTime)
        .map((g) => g.gameId),
    ).toEqual(expected);
  });
});
