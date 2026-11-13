// Worked examples and generated-input tests for step 2.8 (P7 §5.6, §6, §8; S-11; T6 §9).
// Expected values below were worked out by hand from the fixture, not by the code.
import { describe, expect, it } from 'vitest';
import { leaders, seasonTotals, teamTotals } from './index.ts';
import type { PlayerGameLine, StatsGame } from './index.ts';

const line = (
  teamId: string,
  personId: string,
  stats: Record<string, number>,
  secondsPlayed: number | null = null,
  played = true,
): PlayerGameLine => ({ teamId, personId, played, secondsPlayed, stats });

const game = (
  gameId: string,
  status: StatsGame['status'],
  captureMode: StatsGame['captureMode'],
  lines: PlayerGameLine[],
): StatsGame => ({ gameId, status, captureMode, homeTeamId: 'A', awayTeamId: 'B', lines });

// One season mixing the three ways of recording a game, plus games that must not count.
// ann: points 10 + 20 = 30 over 2 games, fouls 2 in 1 game, 1200 seconds in 1 game.
// bob: points 8 + 4 = 12 over 2 games, fouls 1 in 1 game, 1500 seconds in 1 game.
const games: StatsGame[] = [
  game('g1', 'final', 'live', [
    line('A', 'ann', { points: 10, fouls: 2 }, 1200),
    line('A', 'amy', { points: 0, fouls: 0 }, 0, false), // rostered, never entered
    line('B', 'bob', { points: 8, fouls: 1 }, 1500),
  ]),
  game('g2', 'final', 'box', [line('A', 'ann', { points: 20 }), line('B', 'bob', { points: 4 })]),
  game('g3', 'final', 'final', []),
  game('g4', 'live', 'live', [line('A', 'ann', { points: 99, fouls: 9 }, 600)]),
  game('g5', 'forfeit', 'final', []),
  game('g6', 'forfeit', 'box', [line('A', 'ann', { points: 50 }, 900)]),
  game('g7', 'postponed', 'box', [line('B', 'bob', { points: 40 }, 900)]),
];

describe('seasonTotals', () => {
  const totals = seasonTotals(games);
  const ann = totals.find((p) => p.personId === 'ann');
  const bob = totals.find((p) => p.personId === 'bob');

  it('counts only final games (S-11), even forfeit and postponed games that carry lines', () => {
    expect(ann?.stats['points']?.total).toBe(30);
    expect(ann?.gamesPlayed).toBe(2);
    expect(bob?.stats['points']?.total).toBe(12);
    expect(bob?.gamesPlayed).toBe(2);
  });

  it('gives no game played to a rostered player who never entered', () => {
    expect(totals.map((p) => p.personId)).toEqual(['ann', 'bob']);
  });

  it('averages each stat only over the games where it was recorded', () => {
    expect(ann?.stats['points']).toEqual({ total: 30, gamesRecorded: 2, average: 15 });
    expect(ann?.stats['fouls']).toEqual({ total: 2, gamesRecorded: 1, average: 2 });
    expect(ann?.seconds).toEqual({ total: 1200, gamesRecorded: 1, average: 1200 });
    expect(bob?.stats['points']).toEqual({ total: 12, gamesRecorded: 2, average: 6 });
    expect(bob?.seconds).toEqual({ total: 1500, gamesRecorded: 1, average: 1500 });
  });

  it('keeps a recorded zero distinct from a stat that was not recorded', () => {
    const zero = seasonTotals([
      game('a', 'final', 'live', [line('A', 'zed', { points: 0 })]),
      game('b', 'final', 'box', [line('A', 'zed', {})]),
    ]);
    expect(zero[0]?.stats['points']).toEqual({ total: 0, gamesRecorded: 1, average: 0 });
    expect(zero[0]?.gamesPlayed).toBe(2);
  });

  it('leaves out players of teams whose numbers are hidden', () => {
    const hidden = seasonTotals(games, { hiddenTeamIds: new Set(['B']) });
    expect(hidden.map((p) => p.personId)).toEqual(['ann']);
    expect(hidden[0]?.stats['points']?.total).toBe(30);
  });

  it('shows only the visible team for a player on a hidden and a visible team', () => {
    // mo: 6 points for A in game a, 9 points for B in game b.
    const moved = [
      game('a', 'final', 'box', [line('A', 'mo', { points: 6 }), line('B', 'bob', { points: 1 })]),
      game('b', 'final', 'box', [line('B', 'mo', { points: 9 })]),
    ];
    const shown = seasonTotals(moved, { hiddenTeamIds: new Set(['B']) });
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ personId: 'mo', teamIds: ['A'], gamesPlayed: 1 });
    expect(shown[0]?.stats['points']).toEqual({ total: 6, gamesRecorded: 1, average: 6 });
    const all = seasonTotals(moved).find((p) => p.personId === 'mo');
    expect(all).toMatchObject({ teamIds: ['A', 'B'], gamesPlayed: 2 });
    expect(all?.stats['points']?.total).toBe(15);
  });

  it('counts a game once when a person has two lines in it, adding the lines', () => {
    const twice = seasonTotals([
      game('a', 'final', 'box', [
        line('A', 'dup', { points: 3 }, 100),
        line('A', 'dup', { points: 4, fouls: 1 }, 50),
      ]),
    ]);
    expect(twice[0]?.gamesPlayed).toBe(1);
    expect(twice[0]?.stats['points']).toEqual({ total: 7, gamesRecorded: 1, average: 7 });
    expect(twice[0]?.stats['fouls']).toEqual({ total: 1, gamesRecorded: 1, average: 1 });
    expect(twice[0]?.seconds).toEqual({ total: 150, gamesRecorded: 1, average: 150 });
  });

  it('is safe with stat names that exist on every object', () => {
    const odd = seasonTotals([game('a', 'final', 'box', [line('A', 'odd', { constructor: 2 })])]);
    expect(odd[0]?.stats['constructor']?.total).toBe(2);
    const board = leaders(odd, {
      measure: { kind: 'stat', key: 'toString' },
      by: 'total',
      minimumGames: 0,
    });
    expect(board).toEqual([]);
  });
});

describe('teamTotals', () => {
  const teams = teamTotals(games);
  const a = teams.find((t) => t.teamId === 'A');
  const b = teams.find((t) => t.teamId === 'B');

  it('produces totals for every team from final games, including final-score-only games', () => {
    // g1, g2 and g3 are final; g4 is live, g5 and g6 forfeits, g7 postponed.
    expect(a?.finalNonForfeitGames).toBe(3);
    expect(a?.stats['points']).toEqual({ total: 30, gamesRecorded: 2, average: 15 });
    expect(a?.stats['fouls']).toEqual({ total: 2, gamesRecorded: 1, average: 2 });
    expect(b?.finalNonForfeitGames).toBe(3);
    expect(b?.stats['points']).toEqual({ total: 12, gamesRecorded: 2, average: 6 });
  });

  it('still includes a team whose player numbers are hidden', () => {
    const hiddenPlayers = seasonTotals(games, { hiddenTeamIds: new Set(['B']) });
    expect(hiddenPlayers.some((p) => p.teamIds.includes('B'))).toBe(false);
    expect(b?.stats['points']?.total).toBe(12);
  });
});

describe('leaders', () => {
  const people = seasonTotals(games);
  const points = { kind: 'stat', key: 'points' } as const;
  const fouls = { kind: 'stat', key: 'fouls' } as const;
  const rows = (board: ReturnType<typeof leaders>) => board.map((l) => [l.personId, l.value]);

  it('applies the minimum-games rule on games played by default', () => {
    expect(leaders(people, { measure: points, by: 'average', minimumGames: 2 })).toHaveLength(2);
    expect(leaders(people, { measure: points, by: 'average', minimumGames: 3 })).toEqual([]);
    // fouls were recorded in one game only, but both players played two games
    expect(leaders(people, { measure: fouls, by: 'total', minimumGames: 2 })).toHaveLength(2);
  });

  it('can count only games where the measure was recorded', () => {
    const board = leaders(people, {
      measure: fouls,
      by: 'total',
      minimumGames: 2,
      minimumGamesBasis: 'recorded',
    });
    expect(board).toEqual([]);
  });

  it('ranks by average and total', () => {
    const average = leaders(people, { measure: points, by: 'average', minimumGames: 0 });
    expect(rows(average)).toEqual([
      ['ann', 15],
      ['bob', 6],
    ]);
    const total = leaders(people, { measure: points, by: 'total', minimumGames: 0 });
    expect(rows(total)).toEqual([
      ['ann', 30],
      ['bob', 12],
    ]);
  });

  it('shares rank mid-board and skips the next rank (1, 2, 2, 4)', () => {
    const tied = seasonTotals([
      game('a', 'final', 'box', [
        line('A', 'p1', { points: 9 }),
        line('A', 'p2', { points: 5 }),
        line('A', 'p3', { points: 5 }),
        line('A', 'p4', { points: 1 }),
      ]),
    ]);
    const board = leaders(tied, { measure: points, by: 'total', minimumGames: 1 });
    expect(board.map((l) => [l.personId, l.rank])).toEqual([
      ['p1', 1],
      ['p2', 2],
      ['p3', 2],
      ['p4', 4],
    ]);
    expect(leaders(tied, { measure: points, by: 'total', minimumGames: 1, limit: 2 })).toHaveLength(
      2,
    );
    expect(leaders(tied, { measure: points, by: 'total', minimumGames: 1, limit: 0 })).toEqual([]);
  });

  it('shares rank on tied averages', () => {
    // x: (10 + 20) / 2 = 15; y: 15 in one game; z: 14 in one game
    const set = [
      game('a', 'final', 'box', [
        line('A', 'x', { points: 10 }),
        line('A', 'y', { points: 15 }),
        line('A', 'z', { points: 14 }),
      ]),
      game('b', 'final', 'box', [line('A', 'x', { points: 20 })]),
    ];
    const board = leaders(seasonTotals(set), { measure: points, by: 'average', minimumGames: 1 });
    expect(board.map((l) => [l.personId, l.rank, l.value])).toEqual([
      ['x', 1, 15],
      ['y', 1, 15],
      ['z', 3, 14],
    ]);
  });

  it('shares rank on tied seconds and ranks them in seconds', () => {
    const set = [
      game('a', 'final', 'live', [
        line('A', 's1', {}, 1800),
        line('A', 's2', {}, 1800),
        line('A', 's3', {}, 600),
      ]),
    ];
    const board = leaders(seasonTotals(set), {
      measure: { kind: 'seconds' },
      by: 'total',
      minimumGames: 1,
    });
    expect(board.map((l) => [l.personId, l.rank, l.value])).toEqual([
      ['s1', 1, 1800],
      ['s2', 1, 1800],
      ['s3', 3, 600],
    ]);
    const byAverage = leaders(people, {
      measure: { kind: 'seconds' },
      by: 'average',
      minimumGames: 1,
    });
    expect(rows(byAverage)).toEqual([
      ['bob', 1500],
      ['ann', 1200],
    ]);
  });

  it('keeps a real stat named minutes separate from time on court', () => {
    const named = seasonTotals([
      game('a', 'final', 'live', [
        line('A', 'm1', { minutes: 7 }, 60),
        line('A', 'm2', { minutes: 9 }, 3000),
      ]),
    ]);
    const stat = leaders(named, {
      measure: { kind: 'stat', key: 'minutes' },
      by: 'total',
      minimumGames: 1,
    });
    expect(rows(stat)).toEqual([
      ['m2', 9],
      ['m1', 7],
    ]);
    const seconds = leaders(named, { measure: { kind: 'seconds' }, by: 'total', minimumGames: 1 });
    expect(rows(seconds)).toEqual([
      ['m2', 3000],
      ['m1', 60],
    ]);
  });

  it('rejects a minimum or limit that is negative, fractional or not a number', () => {
    for (const bad of [-1, Number.NaN, 1.5, Number.POSITIVE_INFINITY]) {
      expect(() => leaders(people, { measure: points, by: 'total', minimumGames: bad })).toThrow(
        RangeError,
      );
      expect(() =>
        leaders(people, { measure: points, by: 'total', minimumGames: 1, limit: bad }),
      ).toThrow(RangeError);
    }
  });
});

describe('generated inputs', () => {
  function random(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }
  const keys = ['points', 'fouls', 'assists'];

  it('totals equal the sum of the lines, and averages the total over recorded games', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const next = random(seed);
      const statuses = ['final', 'final', 'final', 'live', 'cancelled', 'forfeit'] as const;
      const generated: StatsGame[] = Array.from({ length: 1 + Math.floor(next() * 8) }, (_, g) =>
        game(
          `g${g}`,
          statuses[Math.floor(next() * statuses.length)]!,
          'box',
          Array.from({ length: Math.floor(next() * 6) }, (_, n) => {
            const stats: Record<string, number> = {};
            for (const key of keys) if (next() < 0.6) stats[key] = Math.floor(next() * 30);
            return line(
              next() < 0.5 ? 'A' : 'B',
              `p${n}`,
              stats,
              next() < 0.5 ? Math.floor(next() * 2400) : null,
              next() < 0.8,
            );
          }),
        ),
      );
      const expected = new Map<string, number>();
      const recorded = new Map<string, number>();
      for (const g of generated) {
        if (g.status !== 'final') continue;
        for (const l of g.lines) {
          if (!l.played) continue;
          for (const [key, value] of Object.entries(l.stats)) {
            const id = `${l.personId}|${key}`;
            expected.set(id, (expected.get(id) ?? 0) + value);
            recorded.set(id, (recorded.get(id) ?? 0) + 1);
          }
        }
      }
      const result = seasonTotals(generated);
      let seen = 0;
      for (const person of result) {
        for (const [key, stat] of Object.entries(person.stats)) {
          const id = `${person.personId}|${key}`;
          seen += 1;
          expect(stat.total).toBe(expected.get(id));
          expect(stat.gamesRecorded).toBe(recorded.get(id));
          expect(stat.average).toBe(stat.total / stat.gamesRecorded);
          expect(stat.gamesRecorded).toBeLessThanOrEqual(person.gamesPlayed);
        }
      }
      expect(seen).toBe(expected.size);
      // With nothing hidden, a team's total is the sum of its players' lines.
      for (const team of teamTotals(generated)) {
        for (const [key, stat] of Object.entries(team.stats)) {
          const sum = generated
            .filter((g) => g.status === 'final')
            .flatMap((g) => g.lines)
            .filter((l) => l.played && l.teamId === team.teamId)
            .reduce((all, l) => all + (l.stats[key] ?? 0), 0);
          expect(stat.total).toBe(sum);
        }
      }
    }
  });
});
