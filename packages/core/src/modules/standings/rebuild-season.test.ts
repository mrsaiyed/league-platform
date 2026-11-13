import { describe, expect, it } from 'vitest';
import {
  divisionId,
  game,
  line,
  memoryStandings,
  personId,
  rules,
  seasonId,
  teamId,
} from './memory-standings.test-helper.ts';
import { rebuildSeason } from './rebuild-season.ts';

const final = { status: 'final', finalizedAt: '2026-12-20T20:00:00.000Z' };

/** Runs rebuildSeason in one memory transaction and returns what it saved. */
async function rebuilt(...args: Parameters<typeof memoryStandings>) {
  const { db, transaction, as } = memoryStandings(...args);
  const result = await transaction(as(null), (tx) => rebuildSeason(tx, seasonId));
  return { result, rows: db.state.rows[seasonId] ?? [], totals: db.state.totals[seasonId] ?? [] };
}

describe('rebuildSeason', () => {
  it('counts final and forfeit games only, and players from final games only', async () => {
    const { rows, totals } = await rebuilt({
      games: [
        game(1, 1, 2, { ...final, homeScore: 60, awayScore: 50 }),
        // A forfeit is stored with the forfeit score; its winner comes from it.
        game(2, 3, 4, { ...final, status: 'forfeit', homeScore: 0, awayScore: 20 }),
        game(3, 1, 3, { status: 'postponed' }),
        game(4, 2, 4, { ...final, binned: true, homeScore: 10, awayScore: 0 }),
      ],
      lines: [line(1, 1, 1, 20), line(2, 3, 3, 5), line(3, 1, 1, 9), line(4, 2, 2, 8)],
    });
    expect(rows.find((r) => r.teamId === teamId(4))).toMatchObject({ wins: 1, gamesPlayed: 1 });
    expect(rows.find((r) => r.teamId === teamId(3))).toMatchObject({ losses: 1 });
    expect(rows.find((r) => r.teamId === teamId(2))).toMatchObject({ gamesPlayed: 1, losses: 1 });
    expect(totals.map((t) => [t.personId, t.gamesPlayed])).toEqual([[personId(1), 1]]);
  });

  it("puts each team in its own division's table and applies adjustments", async () => {
    const { rows, result } = await rebuilt({
      teams: [
        { teamId: teamId(1), divisionId, seasonId },
        { teamId: teamId(2), divisionId, seasonId },
        { teamId: teamId(3), divisionId: null, seasonId },
      ],
      games: [game(1, 1, 2, { ...final, homeScore: 60, awayScore: 50 })],
      adjustments: [
        {
          id: '01900000-0000-7000-8000-0000000e0001',
          seasonId,
          teamId: teamId(3),
          wins: 2,
          losses: 0,
          ties: 0,
          points: 0,
          reason: 'Awarded two wins',
        },
      ],
    });
    expect(rows.map((r) => [r.teamId, r.divisionId, r.seed])).toEqual([
      [teamId(3), null, 1],
      [teamId(1), divisionId, 1],
      [teamId(2), divisionId, 2],
    ]);
    expect(rows[0]).toMatchObject({ wins: 2, gamesPlayed: 0 });
    expect(result).toMatchObject({ teams: 3, problems: [] });
  });

  it('reads the season rules: points tables rank by points', async () => {
    const { rows } = await rebuilt({
      seasons: [
        {
          id: seasonId,
          programId: 'p1',
          rules: rules((r) => {
            r.standings.rankBy = 'points';
            r.standings.pointsPerWin = 3;
            if (!r.standings.columns.includes('points')) r.standings.columns.push('points');
          }),
        },
      ],
      games: [game(1, 1, 2, { ...final, homeScore: 60, awayScore: 50 })],
    });
    expect(rows[0]).toMatchObject({ teamId: teamId(1), points: 3 });
  });

  it('orders a game with no start time by when it was decided', async () => {
    const { result } = await rebuilt({
      games: [game(1, 1, 2, { ...final, startsAt: null, homeScore: 60, awayScore: 50 })],
    });
    expect(result.problems).toEqual([]);
  });

  it('saves nothing for a season that is not here', async () => {
    const { db, transaction, as } = memoryStandings();
    const missing = '01900000-0000-7000-8000-0000000000c9';
    expect(await transaction(as(null), (tx) => rebuildSeason(tx, missing))).toEqual({
      teams: 0,
      players: 0,
      problems: [],
    });
    expect(db.state.rows).toEqual({});
  });
});
