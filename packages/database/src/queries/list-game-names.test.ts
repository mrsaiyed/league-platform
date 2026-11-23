// listGameNames gives the scope's league's teams (in the bin too), its seasons and who is
// assigned to score each game, and only that league's (T-28).
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withUnfencedScope } from '../db/db.test-helper.ts';
import { transactionOf, type AppScope, type LeagueScope } from '../db/transaction-scope.ts';
import { withTransaction } from '../db/with-transaction.ts';
import {
  freshSchema,
  newAccount,
  newGame,
  newLeague,
  newSeason,
  newStage,
  newTeam,
  type MadeLeague,
} from '../schema/schema.test-helper.ts';
import { listGameNames } from './list-game-names.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let a: MadeLeague;
let b: MadeLeague;
const ids: Record<string, string> = {};

/** A season named `name` with two teams and one game between them, assigned to `scorers`. */
async function seasonWithGame(
  league: MadeLeague,
  name: string,
  teams: readonly [string, string],
  scorers: readonly string[],
) {
  const seasonId = await newSeason(pglite, league.leagueId, league.defaultProgramId);
  await pglite.query('update seasons set name = $2 where id = $1', [seasonId, name]);
  const stageId = await newStage(pglite, league.leagueId, seasonId);
  const homeTeamId = await newTeam(pglite, league.leagueId, seasonId, { name: teams[0] });
  const awayTeamId = await newTeam(pglite, league.leagueId, seasonId, { name: teams[1] });
  const gameId = await newGame(pglite, {
    leagueId: league.leagueId,
    seasonId,
    stageId,
    homeTeamId,
    awayTeamId,
  });
  for (const accountId of scorers) {
    await pglite.query(
      'insert into game_assignments (league_id, game_id, account_id) values ($1, $2, $3)',
      [league.leagueId, gameId, accountId],
    );
  }
  ids[name] = seasonId;
  ids[teams[0]] = homeTeamId;
  ids[teams[1]] = awayTeamId;
  ids[`${name} game`] = gameId;
}

let first: string;
let second: string;
let otherScorer: string;

beforeAll(async () => {
  pglite = await freshSchema();
  a = await newLeague(pglite);
  b = await newLeague(pglite);
  first = await newAccount(pglite);
  second = await newAccount(pglite);
  otherScorer = await newAccount(pglite);
  await seasonWithGame(a, 'Winter', ['Herons', 'Otters'], [first, second]);
  await seasonWithGame(a, 'Fall', ['Pines', 'Gulls'], []);
  // A team in the bin keeps its name: an old game still shows who played.
  await pglite.query('update teams set deleted_at = now() where id = $1', [ids['Gulls']]);
  await seasonWithGame(b, 'Other Winter', ['Comets', 'Rockets'], [otherScorer]);
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

const sorted = (rows: readonly { name: string }[]) => rows.map((r) => r.name).sort();

describe('listGameNames', () => {
  it("gives the league's teams, seasons and each game's scorekeepers", async () => {
    const names = await withTransaction(db, { leagueId: a.leagueId }, listGameNames);
    expect(sorted(names.teams)).toEqual(['Gulls', 'Herons', 'Otters', 'Pines']);
    expect(names.teams.find((t) => t.name === 'Herons')?.id).toBe(ids['Herons']);
    expect(sorted(names.seasons)).toEqual(['Fall', 'Winter']);
    expect(names.seasons.find((s) => s.name === 'Fall')?.id).toBe(ids['Fall']);
    // In the order they were assigned.
    expect(names.assignments).toEqual([
      { gameId: ids['Winter game'], accountId: first },
      { gameId: ids['Winter game'], accountId: second },
    ]);
  });

  it('keeps the name of a team in the bin, and says it is there (step 2.56)', async () => {
    const names = await withTransaction(db, { leagueId: a.leagueId }, listGameNames);
    expect(names.teams).toContainEqual({ id: ids['Gulls'], name: 'Gulls', removed: true });
    expect(names.teams).toContainEqual({ id: ids['Herons'], name: 'Herons', removed: false });
  });

  it("never returns another league's teams, seasons or assignments", async () => {
    const names = await withTransaction(db, { leagueId: b.leagueId }, listGameNames);
    expect(sorted(names.teams)).toEqual(['Comets', 'Rockets']);
    expect(sorted(names.seasons)).toEqual(['Other Winter']);
    expect(names.assignments).toEqual([
      { gameId: ids['Other Winter game'], accountId: otherScorer },
    ]);
  });

  it('filters to the league itself, with row-level security out of the way (T-28)', async () => {
    const result = await withUnfencedScope(db, a.leagueId, async (scope) => ({
      teams: await transactionOf(scope).selectFrom('teams').select('league_id').execute(),
      seasons: await transactionOf(scope).selectFrom('seasons').select('league_id').execute(),
      assignments: await transactionOf(scope)
        .selectFrom('game_assignments')
        .select('league_id')
        .execute(),
      listed: await listGameNames(scope),
    }));
    // The unfenced transaction does see league B, so only the query's filters keep it out.
    for (const rows of [result.teams, result.seasons, result.assignments]) {
      expect(rows.some((row) => row.league_id === b.leagueId)).toBe(true);
    }
    expect(sorted(result.listed.teams)).toEqual(['Gulls', 'Herons', 'Otters', 'Pines']);
    expect(sorted(result.listed.seasons)).toEqual(['Fall', 'Winter']);
    expect(result.listed.assignments.map((x) => x.accountId)).toEqual([first, second]);
  });

  it('cannot be called without a league scope (T-28)', () => {
    expectTypeOf(listGameNames).parameter(0).toEqualTypeOf<LeagueScope>();
    // Never run: these lines are here for the type check, which must refuse each.
    const refused = [
      // @ts-expect-error no scope at all
      () => listGameNames(),
      // @ts-expect-error a plain object with a league ID is not a scope
      () => listGameNames({ leagueId: a.leagueId, accountId: null }),
      // @ts-expect-error a transaction opened with no league is not a LeagueScope
      (scope: AppScope) => listGameNames(scope),
    ];
    expect(refused).toHaveLength(3);
  });
});
