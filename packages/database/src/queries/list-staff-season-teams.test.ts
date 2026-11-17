// listStaffSeasonTeams lists a season's teams not in the bin, by name, whatever the
// season's state, and only of the league in scope (T-28).
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withUnfencedScope } from '../db/db.test-helper.ts';
import { transactionOf, type AppScope, type LeagueScope } from '../db/transaction-scope.ts';
import { withTransaction } from '../db/with-transaction.ts';
import {
  freshSchema,
  newDivision,
  newLeague,
  newSeason,
  newTeam,
  type MadeLeague,
} from '../schema/schema.test-helper.ts';
import { listStaffSeasonTeams } from './list-staff-season-teams.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let a: MadeLeague;
let b: MadeLeague;
let draft: string;
let otherSeason: string;
let bSeason: string;
const team: Record<string, string> = {};

beforeAll(async () => {
  pglite = await freshSchema();
  a = await newLeague(pglite);
  b = await newLeague(pglite);
  // A season still being set up: staff work on its teams before visitors see it.
  draft = await newSeason(pglite, a.leagueId, a.defaultProgramId, { slug: 'draft' });
  otherSeason = await newSeason(pglite, a.leagueId, a.defaultProgramId, { slug: 'other' });
  const north = await newDivision(pglite, a.leagueId, draft, { name: 'North' });
  team['otters'] = await newTeam(pglite, a.leagueId, draft, {
    slug: 'otters',
    name: 'Otters',
    divisionId: north,
  });
  team['bears'] = await newTeam(pglite, a.leagueId, draft, { slug: 'bears', name: 'Bears' });
  team['binned'] = await newTeam(pglite, a.leagueId, draft, { slug: 'gone', name: 'Albatross' });
  await pglite.query('update teams set deleted_at = now() where id = $1', [team['binned']]);
  team['elsewhere'] = await newTeam(pglite, a.leagueId, otherSeason, {
    slug: 'elsewhere',
    name: 'Another Season',
  });
  bSeason = await newSeason(pglite, b.leagueId, b.defaultProgramId, { slug: 'draft' });
  team['b'] = await newTeam(pglite, b.leagueId, bSeason, { slug: 'b-team', name: 'B Team' });
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

const names = (rows: readonly { name: string }[]) => rows.map((r) => r.name);

describe('listStaffSeasonTeams', () => {
  it("lists the season's teams not in the bin, by name, a season being set up too", async () => {
    const rows = await withTransaction(db, { leagueId: a.leagueId }, (scope) =>
      listStaffSeasonTeams(scope, draft),
    );
    expect(names(rows)).toEqual(['Bears', 'Otters']);
    // Each as findTeam returns it: what the screen's forms need, its version among them.
    expect(rows[1]).toEqual({
      id: team['otters'],
      seasonId: draft,
      divisionId: expect.any(String),
      slug: 'otters',
      name: 'Otters',
      color: null,
      statsVisibility: 'everyone',
      lineageId: expect.any(String),
      binned: false,
      version: 1,
    });
  });

  it('lists only that season', async () => {
    const rows = await withTransaction(db, { leagueId: a.leagueId }, (scope) =>
      listStaffSeasonTeams(scope, otherSeason),
    );
    expect(names(rows)).toEqual(['Another Season']);
  });

  it("never lists another league's season, through either league", async () => {
    const fromA = await withTransaction(db, { leagueId: a.leagueId }, (scope) =>
      listStaffSeasonTeams(scope, bSeason),
    );
    expect(fromA).toEqual([]);
    const fromB = await withTransaction(db, { leagueId: b.leagueId }, (scope) =>
      listStaffSeasonTeams(scope, draft),
    );
    expect(fromB).toEqual([]);
  });

  it('filters to the league itself, with row-level security out of the way (T-28)', async () => {
    const result = await withUnfencedScope(db, a.leagueId, async (scope) => ({
      everything: await transactionOf(scope).selectFrom('teams').select('league_id').execute(),
      listed: await listStaffSeasonTeams(scope, bSeason),
    }));
    // The unfenced transaction does see league B, so only the query's filter keeps it out.
    expect(result.everything.some((row) => row.league_id === b.leagueId)).toBe(true);
    expect(result.listed).toEqual([]);
  });

  it('cannot be called without a league scope (T-28)', () => {
    expectTypeOf(listStaffSeasonTeams).parameter(0).toEqualTypeOf<LeagueScope>();
    // Never run: these lines are here for the type check, which must refuse each.
    const refused = [
      // @ts-expect-error no scope at all
      () => listStaffSeasonTeams(),
      // @ts-expect-error a plain object with a league ID is not a scope
      () => listStaffSeasonTeams({ leagueId: a.leagueId, accountId: null }, draft),
      // @ts-expect-error a transaction opened with no league is not a LeagueScope
      (scope: AppScope) => listStaffSeasonTeams(scope, draft),
    ];
    expect(refused).toHaveLength(3);
  });
});
