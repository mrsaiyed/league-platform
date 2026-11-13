// updateLeagueName changes only the scope's league, and only at the version given.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { freshSchema, newLeague, one, type MadeLeague } from '../schema/schema.test-helper.ts';
import { updateLeagueName } from './update-league-name.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let a: MadeLeague;
let b: MadeLeague;
beforeAll(async () => {
  pglite = await freshSchema();
  a = await newLeague(pglite);
  b = await newLeague(pglite);
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

const rename = (name: string, version: number) =>
  withTransaction(db, { leagueId: a.leagueId }, (scope) => updateLeagueName(scope, name, version));
const nameOf = async (leagueId: string) =>
  (await one<{ name: string }>(pglite, 'select name from leagues where id = $1', [leagueId])).name;

describe('updateLeagueName', () => {
  it('renames at the current version and returns the next one', async () => {
    expect(await rename('Renamed', 1)).toBe(2);
    expect(await nameOf(a.leagueId)).toBe('Renamed');
    expect(await nameOf(b.leagueId)).toBe('Made-up League');
  });

  it('changes nothing when the version has moved on (T-46)', async () => {
    expect(await rename('Stale', 1)).toBeUndefined();
    expect(await nameOf(a.leagueId)).toBe('Renamed');
  });
});
