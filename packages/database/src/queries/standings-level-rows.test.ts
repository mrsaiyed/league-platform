// Step 2.198: how level teams were ordered goes into a season's standings rows and comes
// back exactly as the engine said it (replaceStandingsRows, listStandingsRows, core's
// readLevel), and a rebuild that finds the team level with nobody empties it. The
// numbers audit's case 46: Lions, Tigers, Hawks and Bears, all 1-1.
import type { PGlite } from '@electric-sql/pglite';
import { readLevel } from '@srleagues/core';
import { calculateStandings, type StandingsRow } from '@srleagues/sports';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import type { LeagueScope } from '../db/transaction-scope.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { freshSchema, newLeague, newSeason, newTeam } from '../schema/schema.test-helper.ts';
import { listStandingsRows } from './list-standings-rows.ts';
import { replaceStandingsRows } from './replace-standings-rows.ts';

let pglite: PGlite;
let db: DatabaseHandle;
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

const rules = {
  standings: { rankBy: 'win-percentage', pointsPerWin: 2, pointsPerTie: 1, pointsPerLoss: 0 },
  tiebreakers: ['head-to-head', 'point-difference', 'points-scored'],
  allowTies: false,
  forfeit: { winnerScore: 20, loserScore: 0, countsInPointDifference: false },
} as const;

/** The engine's rows for these games between the named teams. */
function rowsAfter(
  ids: Readonly<Record<string, string>>,
  games: readonly (readonly [string, number, string, number])[],
): readonly StandingsRow[] {
  const id = (name: string) => ids[name] ?? name;
  const result = calculateStandings({
    teams: Object.values(ids).map((teamId) => ({ teamId, divisionId: null })),
    games: games.map(([home, homeScore, away, awayScore], n) => ({
      gameId: `game-${n}`,
      status: 'final',
      homeTeamId: id(home),
      awayTeamId: id(away),
      homeScore,
      awayScore,
      winnerTeamId: null,
      startsAt: new Date(Date.UTC(2026, 8, 1 + n, 18)).toISOString(),
    })),
    rules,
  });
  return result.tables.flatMap((table) => table.rows);
}

describe('standings rows keep how level teams were ordered (migration 0022)', () => {
  it('writes the engine’s document on each level row and reads it back whole', async () => {
    const league = await newLeague(pglite);
    const seasonId = await newSeason(pglite, league.leagueId, league.defaultProgramId);
    const ids: Record<string, string> = {};
    for (const name of ['otters', 'lions', 'tigers', 'hawks', 'bears']) {
      ids[name] = await newTeam(pglite, league.leagueId, seasonId, { name });
    }
    const inLeague = <T>(work: (scope: LeagueScope) => Promise<T>) =>
      withTransaction(db, { leagueId: league.leagueId }, work);
    const rows = rowsAfter(ids, [
      ['tigers', 55, 'hawks', 48],
      ['hawks', 51, 'tigers', 47],
      ['otters', 58, 'lions', 49],
      ['lions', 50, 'bears', 44],
      ['bears', 60, 'otters', 52],
    ]);
    const level = rows.find((row) => row.teamId === ids['lions'])?.level;
    expect(level?.teamIds).toHaveLength(5);
    await inLeague((scope) => replaceStandingsRows(scope, seasonId, rows));
    const stored = await inLeague((scope) => listStandingsRows(scope, seasonId));
    expect(stored).toHaveLength(5);
    for (const row of stored) {
      const engine = rows.find((r) => r.teamId === row.teamId);
      expect(readLevel(row.level)).toEqual(engine?.level);
      expect(row.level).toMatchObject({ version: 1 });
    }

    // The Otters beat the Bears: Otters 2-1, Bears 1-2, and Lions, Tigers and Hawks still
    // 1-1, so the rebuild writes the three a new document over the old one.
    const after = rowsAfter(ids, [
      ['tigers', 55, 'hawks', 48],
      ['hawks', 51, 'tigers', 47],
      ['otters', 58, 'lions', 49],
      ['lions', 50, 'bears', 44],
      ['bears', 60, 'otters', 52],
      ['otters', 50, 'bears', 40],
    ]);
    await inLeague((scope) => replaceStandingsRows(scope, seasonId, after));
    const again = await inLeague((scope) => listStandingsRows(scope, seasonId));
    for (const row of again) {
      expect(readLevel(row.level)).toEqual(after.find((r) => r.teamId === row.teamId)?.level);
    }
    // Otters 2-1 and Bears 1-2 are level with nobody now: their documents are gone.
    for (const name of ['otters', 'bears']) {
      expect(again.find((row) => row.teamId === ids[name])?.level).toBeNull();
    }
  });
});
