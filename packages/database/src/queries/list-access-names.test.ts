// listAccessNames (record 052): the names on the access list of the league that is
// set, and nothing of any other league or account.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { sql } from 'kysely';
import { transactionOf } from '../db/transaction-scope.ts';
import {
  freshSchema,
  newAccount,
  newLeague,
  type MadeLeague,
} from '../schema/schema.test-helper.ts';
import { listAccessNames } from './list-access-names.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let a: MadeLeague;
let b: MadeLeague;
let admin: string;
let revoked: string;
let elsewhere: string;
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  a = await newLeague(pglite);
  b = await newLeague(pglite);
  admin = await newAccount(pglite);
  revoked = await newAccount(pglite);
  elsewhere = await newAccount(pglite);
  await pglite.query("update accounts set display_name = 'Ana Admin' where id = $1", [admin]);
  await pglite.query('update accounts set display_name = null where id = $1', [a.ownerId]);
  await pglite.query(
    `insert into role_grants (league_id, account_id, role) values ($1, $2, 'admin'), ($1, $3, 'editor')`,
    [a.leagueId, admin, revoked],
  );
  await pglite.query(
    'update role_grants set revoked_at = now(), revoked_by_account_id = $2 where account_id = $1',
    [revoked, a.ownerId],
  );
  await pglite.query(
    "insert into role_grants (league_id, account_id, role) values ($1, $2, 'scheduler')",
    [b.leagueId, elsewhere],
  );
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

describe('listAccessNames (record 052)', () => {
  it('names the owner and each account with a grant in force, in the league set only', async () => {
    const names = await withTransaction(db, { leagueId: a.leagueId }, (scope) =>
      listAccessNames(scope),
    );
    expect(names).toEqual(
      [
        { accountId: a.ownerId, displayName: null },
        { accountId: admin, displayName: 'Ana Admin' },
      ].sort((x, y) => x.accountId.localeCompare(y.accountId)),
    );
  });

  it("gives league B's names only in B", async () => {
    const names = await withTransaction(db, { leagueId: b.leagueId }, (scope) =>
      listAccessNames(scope),
    );
    expect(names.map((n) => n.accountId).sort()).toEqual([b.ownerId, elsewhere].sort());
  });

  it('answers nothing with no league set', async () => {
    const rows = await withTransaction(db, { accountId: admin }, async (scope) => {
      const { rows } = await sql`select * from public.access_list_names()`.execute(
        transactionOf(scope),
      );
      return rows;
    });
    expect(rows).toEqual([]);
  });
});
