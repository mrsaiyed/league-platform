// findAccountOfSignIn (record 052): the account a sign-in user is, one id at a time,
// with no league and no account set; nothing for an id no account has.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { freshSchema, newAccount } from '../schema/schema.test-helper.ts';
import { findAccountOfSignIn } from './find-account-of-sign-in.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let linked: string;
const signInId = crypto.randomUUID();
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  linked = await newAccount(pglite);
  await pglite.query('update accounts set sign_in_id = $1 where id = $2', [signInId, linked]);
  await newAccount(pglite);
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

const find = (id: string) => withTransaction(db, {}, (scope) => findAccountOfSignIn(scope, id));

describe('findAccountOfSignIn (record 052)', () => {
  it('finds the linked account', async () => {
    expect(await find(signInId)).toBe(linked);
  });

  it('finds nothing for an id no account has, and matches exactly', async () => {
    expect(await find(crypto.randomUUID())).toBeUndefined();
    expect(await find(signInId.toUpperCase())).toBeUndefined();
    expect(await find('')).toBeUndefined();
  });

  it('answers the same inside a league or account transaction', async () => {
    const other = await newAccount(pglite);
    expect(
      await withTransaction(db, { accountId: other }, (scope) =>
        findAccountOfSignIn(scope, signInId),
      ),
    ).toBe(linked);
  });
});
