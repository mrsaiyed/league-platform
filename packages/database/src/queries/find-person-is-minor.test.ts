// findPersonIsMinor answers whether one person of the scope's league counts as a child
// (R-28, in SQL), never their birth date, and only for that league's people (T-28).
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withUnfencedScope } from '../db/db.test-helper.ts';
import { type AppScope, type LeagueScope } from '../db/transaction-scope.ts';
import { withTransaction } from '../db/with-transaction.ts';
import {
  freshSchema,
  newLeague,
  newPerson,
  type MadeLeague,
} from '../schema/schema.test-helper.ts';
import { findPersonIsMinor } from './find-person-is-minor.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let a: MadeLeague;
let b: MadeLeague;
const ids: Record<string, string> = {};

async function person(
  league: MadeLeague,
  name: string,
  birthDate: string | null,
  isMinor: boolean | null,
) {
  const id = await newPerson(pglite, league.leagueId, { firstName: name });
  await pglite.query('update people set birth_date = $2, is_minor = $3 where id = $1', [
    id,
    birthDate,
    isMinor,
  ]);
  ids[name] = id;
}

beforeAll(async () => {
  pglite = await freshSchema();
  a = await newLeague(pglite);
  b = await newLeague(pglite);
  await person(a, 'child', '2012-09-03', false);
  await person(a, 'adult', '1990-04-12', false);
  await person(a, 'ticked', '1990-04-12', true);
  await person(a, 'unknown', null, null);
  await person(b, 'bChild', '2012-09-03', false);
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

const inA = (personId: string | undefined) =>
  withTransaction(db, { leagueId: a.leagueId }, (scope) =>
    findPersonIsMinor(scope, personId ?? ''),
  );

describe('findPersonIsMinor', () => {
  it('answers R-28: a child by date or by the tick, an adult unticked, else not known', async () => {
    expect(await inA(ids['child'])).toEqual({ isMinor: true });
    expect(await inA(ids['adult'])).toEqual({ isMinor: false });
    expect(await inA(ids['ticked'])).toEqual({ isMinor: true });
    expect(await inA(ids['unknown'])).toEqual({ isMinor: null });
  });

  it("never finds another league's person, through either league", async () => {
    expect(await inA(ids['bChild'])).toBeUndefined();
    expect(
      await withTransaction(db, { leagueId: b.leagueId }, (scope) =>
        findPersonIsMinor(scope, ids['child'] ?? ''),
      ),
    ).toBeUndefined();
  });

  it('filters to the league itself, with row-level security out of the way (T-28)', async () => {
    const found = await withUnfencedScope(db, a.leagueId, (scope) =>
      findPersonIsMinor(scope, ids['bChild'] ?? ''),
    );
    expect(found).toBeUndefined();
  });

  it('cannot be called without a league scope (T-28)', () => {
    expectTypeOf(findPersonIsMinor).parameter(0).toEqualTypeOf<LeagueScope>();
    const refused = [
      // @ts-expect-error a plain object with a league ID is not a scope
      () => findPersonIsMinor({ leagueId: a.leagueId, accountId: null }, ''),
      // @ts-expect-error a transaction opened with no league is not a LeagueScope
      (scope: AppScope) => findPersonIsMinor(scope, ''),
    ];
    expect(refused).toHaveLength(2);
  });
});
