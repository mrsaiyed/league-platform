// findLeagueName reads the scope's league's own name only, and nothing from the bin.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withUnfencedScope } from '../db/db.test-helper.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { freshSchema, newLeague, type MadeLeague } from '../schema/schema.test-helper.ts';
import { findLeagueName } from './find-league-name.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let a: MadeLeague;
let b: MadeLeague;
let binned: MadeLeague;
beforeAll(async () => {
  pglite = await freshSchema();
  a = await newLeague(pglite);
  b = await newLeague(pglite);
  binned = await newLeague(pglite);
  await pglite.query("update leagues set name = 'Liga Ñandú · 南' where id = $1", [a.leagueId]);
  await pglite.query('update leagues set deleted_at = now() where id = $1', [binned.leagueId]);
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

describe('findLeagueName', () => {
  it("reads the scope's league's own name, in any script, and only its name", async () => {
    expect(await withTransaction(db, { leagueId: a.leagueId }, findLeagueName)).toBe(
      'Liga Ñandú · 南',
    );
    expect(await withTransaction(db, { leagueId: b.leagueId }, findLeagueName)).toBe(
      'Made-up League',
    );
  });

  it('finds nothing for a league in the bin, even past the fence', async () => {
    expect(await withUnfencedScope(db, binned.leagueId, findLeagueName)).toBeUndefined();
  });
});
