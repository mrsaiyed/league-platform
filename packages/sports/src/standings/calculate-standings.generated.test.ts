// Generated-input tests for standings (T-182): many made-up seasons, each checked
// for what must hold whatever the games are.
import { describe, expect, it } from 'vitest';
import { calculateStandings } from './calculate-standings.ts';
import { generatedSeason, notCountedStatuses, seeded } from './generated-season.test-helper.ts';
import type { StandingsInput, StandingsRow } from './types.ts';

const seasons = 400;

function eachSeason(check: (input: StandingsInput, seed: number) => void): void {
  for (let seed = 1; seed <= seasons; seed++) check(generatedSeason(seeded(seed)), seed);
}

function rowsOf(input: StandingsInput): StandingsRow[] {
  return calculateStandings(input).tables.flatMap((table) => [...table.rows]);
}

/** The table's own measure, scaled so equal values compare equal exactly. */
function primary(row: StandingsRow): number {
  if (row.points !== null) return row.points;
  const decided = row.wins + row.losses + row.ties;
  return decided > 0 ? (2 * row.wins + row.ties) / (2 * decided) : 0;
}

describe('standings: generated inputs', () => {
  it('gives the same tables whatever order games, teams, adjustments and flips arrive in', () => {
    eachSeason((input, seed) => {
      const random = seeded(seed * 7919);
      const expected = calculateStandings(input);
      for (let i = 0; i < 3; i++) {
        const shuffled: StandingsInput = {
          ...input,
          teams: random.shuffle(input.teams),
          games: random.shuffle(input.games),
          adjustments: random.shuffle(input.adjustments ?? []),
          // Flips keep their recorded order: the latest one that covers a tie applies.
          coinFlips: input.coinFlips ?? [],
        };
        expect(calculateStandings(shuffled), `seed ${seed}`).toEqual(expected);
      }
    });
  });

  it('is unchanged by games that are scheduled, live, postponed or cancelled', () => {
    eachSeason((input, seed) => {
      const random = seeded(seed * 104729);
      const extra = input.teams.slice(1).map((team, i) => ({
        gameId: `extra${i}`,
        status: random.pick(notCountedStatuses),
        homeTeamId: input.teams[0]?.teamId ?? team.teamId,
        awayTeamId: team.teamId,
        homeScore: random.int(5),
        awayScore: random.int(5),
        winnerTeamId: null,
        startsAt: '2026-06-01T00:00:00.000Z',
      }));
      const withExtra = { ...input, games: [...input.games, ...extra] };
      expect(calculateStandings(withExtra), `seed ${seed}`).toEqual(calculateStandings(input));
    });
  });

  it('lists every team once, seeds 1 to n in each table and never ranks a lower measure higher', () => {
    eachSeason((input, seed) => {
      const result = calculateStandings(input);
      const listed = result.tables.flatMap((table) => table.rows.map((row) => row.teamId));
      expect([...listed].sort(), `seed ${seed}`).toEqual(input.teams.map((t) => t.teamId).sort());
      for (const table of result.tables) {
        table.rows.forEach((row, i) => {
          expect(row.seed, `seed ${seed}`).toBe(i + 1);
          expect(row.rank, `seed ${seed}`).toBeLessThanOrEqual(row.seed);
          expect(row.divisionId, `seed ${seed}`).toBe(table.divisionId);
          const previous = table.rows[i - 1];
          if (!previous) {
            expect(row.rank).toBe(1);
            return;
          }
          expect(primary(previous), `seed ${seed}`).toBeGreaterThanOrEqual(primary(row));
          if (row.rank === previous.rank) {
            // Only teams no tiebreaker could split share a place.
            expect([row.decidedBy, previous.decidedBy], `seed ${seed}`).toEqual([
              'still-tied',
              'still-tied',
            ]);
          } else {
            expect(row.rank, `seed ${seed}`).toBe(row.seed);
          }
          // A place decided by the record alone is not level with its neighbours.
          if (row.decidedBy === null || previous.decidedBy === null) {
            expect(primary(previous), `seed ${seed}`).toBeGreaterThan(primary(row));
          }
        });
      }
    });
  });

  it('balances: without adjustments every win has a loss and every point for has a point against', () => {
    eachSeason((input, seed) => {
      const rows = rowsOf({ ...input, adjustments: [] });
      const sum = (pick: (row: StandingsRow) => number): number =>
        rows.reduce((total, row) => total + pick(row), 0);
      expect(
        sum((row) => row.wins),
        `seed ${seed}`,
      ).toBe(sum((row) => row.losses));
      expect(sum((row) => row.ties) % 2, `seed ${seed}`).toBe(0);
      expect(
        sum((row) => row.pointsFor),
        `seed ${seed}`,
      ).toBe(sum((row) => row.pointsAgainst));
      expect(
        sum((row) => row.pointDifference),
        `seed ${seed}`,
      ).toBe(0);
      const counted = input.games.filter((g) => g.status === 'final' || g.status === 'forfeit');
      expect(
        sum((row) => row.gamesPlayed),
        `seed ${seed}`,
      ).toBe(2 * counted.length);
    });
  });

  it('with any adjustments: no count goes below zero, games played stays the games, and every footnote is a real change', () => {
    eachSeason((input, seed) => {
      const result = calculateStandings(input);
      const rows = result.tables.flatMap((table) => [...table.rows]);
      const plain = new Map(
        rowsOf({ ...input, adjustments: [] }).map((row) => [row.teamId, row] as const),
      );
      for (const row of rows) {
        expect(
          [row.wins, row.losses, row.ties].every((n) => n >= 0),
          `seed ${seed}`,
        ).toBe(true);
        const before = plain.get(row.teamId);
        expect(before, `seed ${seed}`).toBeDefined();
        if (!before) continue;
        expect(row.gamesPlayed, `seed ${seed}`).toBe(before.gamesPlayed);
        expect([row.pointsFor, row.pointsAgainst], `seed ${seed}`).toEqual([
          before.pointsFor,
          before.pointsAgainst,
        ]);
        expect(row.streak, `seed ${seed}`).toEqual(before.streak);
        const changed =
          row.wins !== before.wins ||
          row.losses !== before.losses ||
          row.ties !== before.ties ||
          row.points !== before.points;
        if (!changed && row.adjustments.length > 0) {
          // Footnotes that cancel out are possible; each one on its own must still change something.
          for (const note of row.adjustments) {
            const adjustment = (input.adjustments ?? []).find(
              (a) => a.adjustmentId === note.adjustmentId,
            );
            const record = Boolean(adjustment?.wins || adjustment?.losses || adjustment?.ties);
            const points = row.points !== null && Boolean(adjustment?.points);
            expect(record || points, `seed ${seed}`).toBe(true);
          }
        }
      }
      const shown = new Set(rows.flatMap((row) => row.adjustments.map((a) => a.adjustmentId)));
      const leftOut = new Set(
        result.problems.filter((p) => p.kind === 'adjustment' && p.leftOut).map((p) => p.id),
      );
      for (const adjustment of input.adjustments ?? []) {
        // Every adjustment is either shown under the table or reported as left out.
        expect(
          shown.has(adjustment.adjustmentId) !== leftOut.has(adjustment.adjustmentId),
          `seed ${seed}`,
        ).toBe(true);
      }
    });
  });
});
