// changeOwnEmail and emailFreeForOwnAccount (T-73, T-458, 0031): only the account set for the
// transaction; another account's address is "not free" and "taken", changing nothing; the
// web app's user still cannot write accounts.email itself.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { freshSchema, newAccount, one } from '../schema/schema.test-helper.ts';
import { changeOwnEmail } from './change-own-email.ts';
import { emailFreeForOwnAccount } from './email-free-for-own-account.ts';

let pglite: PGlite;
let db: DatabaseHandle;
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

const emailOf = async (id: string) =>
  (await one<{ email: string }>(pglite, 'select email from accounts where id = $1', [id])).email;
const change = (accountId: string, email: string) =>
  withTransaction(db, { accountId }, (scope) => changeOwnEmail(scope, email));
const free = (accountId: string, email: string) =>
  withTransaction(db, { accountId }, (scope) => emailFreeForOwnAccount(scope, email));

describe('a change of email in our own records (0031)', () => {
  it("moves the account set's address, and only that account's", async () => {
    const ana = await newAccount(pglite, 'ana@example.test');
    const bo = await newAccount(pglite, 'bo@example.test');
    expect(await free(ana, 'ana.new@example.test')).toBe(true);
    expect(await free(ana, 'ANA@example.test')).toBe(true);
    expect(await change(ana, 'ana.new@example.test')).toBe('changed');
    expect(await emailOf(ana)).toBe('ana.new@example.test');
    expect(await emailOf(bo)).toBe('bo@example.test');
  });

  it("another account's address, in any case, is not free and taken: nothing changes", async () => {
    const cy = await newAccount(pglite, 'cy@example.test');
    await newAccount(pglite, 'dee@example.test');
    expect(await free(cy, 'DEE@example.test')).toBe(false);
    expect(await change(cy, 'Dee@Example.test')).toBe('taken');
    expect(await emailOf(cy)).toBe('cy@example.test');
  });

  it('refuses an address on .invalid, and a transaction with no account', async () => {
    const eve = await newAccount(pglite, 'eve@example.test');
    await expect(change(eve, 'eve@gone.invalid')).rejects.toThrow();
    await expect(
      withTransaction(db, {}, (scope) => changeOwnEmail(scope, 'x@example.test')),
    ).rejects.toThrow('needs a transaction opened for an account');
    await expect(
      pglite.query("select public.change_own_email('x@example.test')"),
    ).rejects.toThrow();
    expect(await emailOf(eve)).toBe('eve@example.test');
  });
});
