// accountForSignIn (record 052): a sign-in user becomes one of our accounts, found by
// its link, found by its address and linked, or made, as the app's role with no
// league and no account set.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { freshSchema, newAccount, one, unique } from '../schema/schema.test-helper.ts';
import { accountForSignIn, isSignInLinkConflict } from './account-for-sign-in.ts';
import { findAccountOfSignIn } from './find-account-of-sign-in.ts';

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

const forSignIn = (signInId: string, email: string) =>
  withTransaction(db, {}, (scope) => accountForSignIn(scope, signInId, email));
const ofSignIn = (signInId: string) =>
  withTransaction(db, {}, (scope) => findAccountOfSignIn(scope, signInId));
const uuidV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('accountForSignIn (record 052)', () => {
  it('makes a new account, with our own version 7 id, and finds it again by its link', async () => {
    const email = `${unique('new')}@example.test`;
    const signInId = crypto.randomUUID();
    expect(await ofSignIn(signInId)).toBeUndefined();
    const made = await forSignIn(signInId, email);
    expect(made).toMatch(uuidV7);
    expect(made).not.toBe(signInId);
    expect(await ofSignIn(signInId)).toBe(made);
    // Again, even with other capitals: the same account, and no second one.
    expect(await forSignIn(signInId, email.toUpperCase())).toBe(made);
    const { n } = await one<{ n: number }>(
      pglite,
      'select count(*)::int as n from accounts where lower(email) = lower($1)',
      [email],
    );
    expect(n).toBe(1);
  });

  it('links an account made for the address before its owner first signed in', async () => {
    const email = `${unique('owner')}@example.test`;
    const existing = await newAccount(pglite, email);
    const signInId = crypto.randomUUID();
    expect(await forSignIn(signInId, email.toUpperCase())).toBe(existing);
    expect(await ofSignIn(signInId)).toBe(existing);
  });

  it('refuses an address whose account is another sign-in user’s, and an erased address', async () => {
    const email = `${unique('taken')}@example.test`;
    await forSignIn(crypto.randomUUID(), email);
    const conflict: unknown = await forSignIn(crypto.randomUUID(), email).catch(
      (error: unknown) => error,
    );
    expect(conflict).toMatchObject({ code: '23505', constraint: 'accounts_sign_in_id_key' });
    expect(isSignInLinkConflict(conflict)).toBe(true);
    const erased: unknown = await forSignIn(
      crypto.randomUUID(),
      `${crypto.randomUUID()}@erased.invalid`,
    ).catch((error: unknown) => error);
    expect(erased).toMatchObject({ code: '23514' });
    // Only that refusal: any other error is not a link conflict.
    expect(isSignInLinkConflict(erased)).toBe(false);
    expect(isSignInLinkConflict(new Error('accounts_sign_in_id_key'))).toBe(false);
  });

  it('keeps a linked sign-in user’s account whatever address the service now gives', async () => {
    const signInId = crypto.randomUUID();
    const account = await forSignIn(signInId, `${unique('own')}@example.test`);
    await expect(
      withTransaction(db, { accountId: account }, (scope) =>
        accountForSignIn(scope, signInId, `${unique('changed')}@example.test`),
      ),
    ).resolves.toBe(account);
  });
});
