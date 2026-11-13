// findProgramBySlug finds a program only in the league in scope.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withUnfencedScope } from '../db/db.test-helper.ts';
import type { AppScope, LeagueScope } from '../db/transaction-scope.ts';
import { withTransaction } from '../db/with-transaction.ts';
import {
  freshSchema,
  newLeague,
  newProgram,
  type MadeLeague,
} from '../schema/schema.test-helper.ts';
import { findProgramBySlug } from './find-program-by-slug.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let a: MadeLeague;
let b: MadeLeague;
let youthId: string;
beforeAll(async () => {
  pglite = await freshSchema();
  a = await newLeague(pglite);
  b = await newLeague(pglite);
  youthId = await newProgram(pglite, a.leagueId, 'youth');
  const binned = await newProgram(pglite, a.leagueId, 'old');
  await pglite.query('update programs set deleted_at = now() where id = $1', [binned]);
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

const find = (leagueId: string, slug: string) =>
  withTransaction(db, { leagueId }, (scope) => findProgramBySlug(scope, slug));

describe('findProgramBySlug', () => {
  it("finds the league's program by its short name", async () => {
    expect(await find(a.leagueId, 'youth')).toMatchObject({ id: youthId, slug: 'youth' });
  });

  it('does not find a program in the bin', async () => {
    expect(await find(a.leagueId, 'old')).toBeUndefined();
  });

  it("does not find another league's program with that name", async () => {
    expect(await find(b.leagueId, 'youth')).toBeUndefined();
    expect((await find(b.leagueId, 'main'))?.id).toBe(b.defaultProgramId);
  });

  it('filters to the league itself, with row-level security out of the way (T-28)', async () => {
    const found = await withUnfencedScope(db, b.leagueId, (scope) =>
      findProgramBySlug(scope, 'youth'),
    );
    expect(found).toBeUndefined();
  });

  it('cannot be called without a league scope (T-28)', () => {
    expectTypeOf(findProgramBySlug).parameter(0).toEqualTypeOf<LeagueScope>();
    // Never run: these lines are here for the type check, which must refuse each.
    const refused = [
      // @ts-expect-error a plain object with a league ID is not a scope
      () => findProgramBySlug({ leagueId: a.leagueId, accountId: null }, 'youth'),
      // @ts-expect-error a transaction opened with no league is not a LeagueScope
      (scope: AppScope) => findProgramBySlug(scope, 'youth'),
    ];
    expect(refused).toHaveLength(2);
  });
});
