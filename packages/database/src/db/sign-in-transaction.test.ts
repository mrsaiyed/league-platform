// Record 052: each sign-in store transaction runs as sign_in_store, with no league and
// no account, and has the same guards as withTransaction: no nesting either way, no
// second connection inside the work, a scope that dies with its transaction, and
// nothing left behind on the connection.
import type { PGlite } from '@electric-sql/pglite';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshSchema } from '../schema/schema.test-helper.ts';
import { createDatabase } from './create-database.ts';
import { kyselyOf, type DatabaseHandle } from './database-handle.ts';
import { signInTransactionOf, withSignInTransaction } from './sign-in-transaction.ts';
import { withTransaction } from './with-transaction.ts';

type Settings = { league: string | null; account: string | null; role: string };
const readSettings = sql<Settings>`select current_setting('app.league_id', true) as league,
  current_setting('app.account_id', true) as account,
  current_user as role`;

let pglite: PGlite;
let db: DatabaseHandle;
beforeAll(async () => {
  pglite = await freshSchema();
  // PGlite is one connection, so every transaction here runs on the same one.
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

describe('withSignInTransaction', () => {
  it('runs as sign_in_store with no league and no account set', async () => {
    const seen = await withSignInTransaction(db, (scope) =>
      readSettings.execute(signInTransactionOf(scope)),
    );
    expect(seen.rows[0]).toEqual({ league: '', account: '', role: 'sign_in_store' });
  });

  it('reaches the sign_in schema and nothing in public', async () => {
    const users = await withSignInTransaction(db, (scope) =>
      signInTransactionOf(scope).selectFrom('sign_in.users').select('user_id').execute(),
    );
    expect(users).toEqual([]);
    await expect(
      withSignInTransaction(db, (scope) =>
        sql`select count(*) from public.leagues`.execute(signInTransactionOf(scope)),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('leaves no role behind for the next transaction on the same connection', async () => {
    await withSignInTransaction(db, (scope) => readSettings.execute(signInTransactionOf(scope)));
    const after = await kyselyOf(db)
      .transaction()
      .execute((trx) => readSettings.execute(trx));
    expect(after.rows[0]?.role).toBe('postgres');
  });

  it('rolls back when the work throws', async () => {
    const failing = withSignInTransaction(db, async (scope) => {
      await signInTransactionOf(scope)
        .insertInto('sign_in.users')
        .values({ user_id: 'undone' })
        .execute();
      throw new Error('stop');
    });
    await expect(failing).rejects.toThrow('stop');
    const { rows } = await pglite.query(
      "select user_id from sign_in.users where user_id = 'undone'",
    );
    expect(rows).toEqual([]);
  });

  it('closes the scope when the transaction ends', async () => {
    const kept = await withSignInTransaction(db, async (scope) => scope);
    expect(() => signInTransactionOf(kept)).toThrow('not open');
  });

  it('refuses to nest, either way, instead of waiting forever', async () => {
    await expect(
      withSignInTransaction(db, () => withSignInTransaction(db, async () => 1)),
    ).rejects.toThrow('inside another transaction');
    await expect(
      withSignInTransaction(db, () => withTransaction(db, {}, async () => 1)),
    ).rejects.toThrow('inside another withTransaction');
    await expect(
      withTransaction(db, {}, () => withSignInTransaction(db, async () => 1)),
    ).rejects.toThrow('inside another transaction');
  });

  it('refuses a query on the bare handle inside the work', async () => {
    const bare = withSignInTransaction(db, () =>
      kyselyOf(db).selectFrom('programs').select('league_id').execute(),
    );
    await expect(bare).rejects.toThrow('second connection was asked for');
  });
});
