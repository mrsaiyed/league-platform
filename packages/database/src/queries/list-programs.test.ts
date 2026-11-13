// listPrograms returns only the league in scope's programs, and cannot be called
// without a league scope (T-28).
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { transactionOf, type AppScope, type LeagueScope } from '../db/transaction-scope.ts';
import { withUnfencedScope } from '../db/db.test-helper.ts';
import { withTransaction } from '../db/with-transaction.ts';
import {
  freshSchema,
  newLeague,
  newProgram,
  type MadeLeague,
} from '../schema/schema.test-helper.ts';
import { listPrograms } from './list-programs.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let a: MadeLeague;
let b: MadeLeague;
beforeAll(async () => {
  pglite = await freshSchema();
  a = await newLeague(pglite);
  b = await newLeague(pglite);
  await newProgram(pglite, a.leagueId, 'youth');
  const binned = await newProgram(pglite, a.leagueId, 'old');
  await pglite.query('update programs set deleted_at = now() where id = $1', [binned]);
  await newProgram(pglite, b.leagueId, 'other');
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

describe('listPrograms', () => {
  it("lists the league's programs not in the bin, the default first", async () => {
    const programs = await withTransaction(db, { leagueId: a.leagueId }, listPrograms);
    expect(programs.map((p) => [p.slug, p.isDefault])).toEqual([
      ['main', true],
      ['youth', false],
    ]);
    expect(programs[0]).toEqual({
      id: a.defaultProgramId,
      slug: 'main',
      name: 'Main',
      sportKey: 'basketball',
      isDefault: true,
    });
  });

  it("never returns another league's programs", async () => {
    const programs = await withTransaction(db, { leagueId: b.leagueId }, listPrograms);
    expect(programs.map((p) => p.slug)).toEqual(['main', 'other']);
  });

  it('filters to the league itself, with row-level security out of the way (T-28)', async () => {
    const result = await withUnfencedScope(db, a.leagueId, async (scope) => ({
      everything: await transactionOf(scope).selectFrom('programs').select('league_id').execute(),
      listed: await listPrograms(scope),
    }));
    // The unfenced transaction does see league B, so only the query's filter keeps it out.
    expect(result.everything.some((row) => row.league_id === b.leagueId)).toBe(true);
    expect(result.listed.map((p) => p.slug)).toEqual(['main', 'youth']);
  });

  it('cannot be called without a league scope (T-28)', () => {
    expectTypeOf(listPrograms).parameter(0).toEqualTypeOf<LeagueScope>();
    // Never run: these lines are here for the type check, which must refuse each.
    const refused = [
      // @ts-expect-error no scope at all
      () => listPrograms(),
      // @ts-expect-error a plain object with a league ID is not a scope
      () => listPrograms({ leagueId: a.leagueId, accountId: null }),
      // @ts-expect-error a transaction opened with no league is not a LeagueScope
      (scope: AppScope) => listPrograms(scope),
    ];
    expect(refused).toHaveLength(3);
  });
});
