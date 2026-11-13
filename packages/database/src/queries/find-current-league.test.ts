// findCurrentLeague reads only the scope's league, and not from the bin.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withUnfencedScope } from '../db/db.test-helper.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { freshSchema, newLeague, type MadeLeague } from '../schema/schema.test-helper.ts';
import { findCurrentLeague } from './find-current-league.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let a: MadeLeague;
let binned: MadeLeague;
beforeAll(async () => {
  pglite = await freshSchema();
  a = await newLeague(pglite);
  binned = await newLeague(pglite);
  await pglite.query('update leagues set deleted_at = now() where id = $1', [binned.leagueId]);
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

describe('findCurrentLeague', () => {
  it("reads the scope's league", async () => {
    expect(await withTransaction(db, { leagueId: a.leagueId }, findCurrentLeague)).toEqual({
      id: a.leagueId,
      name: 'Made-up League',
      slug: expect.stringMatching(/^league-/),
      status: 'draft',
      ownerAccountId: a.ownerId,
      version: 1,
    });
  });

  it('finds nothing for a league in the bin, even past the fence', async () => {
    const found = await withUnfencedScope(db, binned.leagueId, findCurrentLeague);
    expect(found).toBeUndefined();
  });
});
