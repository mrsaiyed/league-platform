// lockLeagueRow (T-403) takes the scope's own league row FOR NO KEY UPDATE: guarded saves
// of one league take turns, and inserts that only point at the league (an activity row)
// are not held up. PGlite has one connection, so the waiting itself is not run here;
// this proves the statement sent, which PGlite accepts, and the row it holds.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { freshSchema, newLeague, type MadeLeague } from '../schema/schema.test-helper.ts';
import { lockLeagueRow } from './lock-league-row.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let a: MadeLeague;
beforeAll(async () => {
  pglite = await freshSchema();
  a = await newLeague(pglite);
  await newLeague(pglite);
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

describe('lockLeagueRow', () => {
  it("holds the scope's own league row FOR NO KEY UPDATE, filtered by its id", async () => {
    const query = vi.spyOn(pglite, 'query');
    try {
      expect(await withTransaction(db, { leagueId: a.leagueId }, lockLeagueRow)).toBe(a.leagueId);
      const locks = query.mock.calls.filter(([sql]) => /from "leagues"/i.test(sql));
      expect(locks).toHaveLength(1);
      const [sql, parameters] = locks[0] ?? [''];
      expect(sql.toLowerCase()).toMatch(/where "id" = \$1 for no key update$/);
      expect(parameters).toEqual([a.leagueId]);
    } finally {
      query.mockRestore();
    }
  });
});
