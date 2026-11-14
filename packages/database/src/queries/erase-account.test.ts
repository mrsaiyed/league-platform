// eraseAccount (record 052, T-52, T-220): the account set for the transaction is
// emptied in place, its own profiles, grants and sign-in rows go, and nothing else.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withTransaction } from '../db/with-transaction.ts';
import {
  freshSchema,
  newAccount,
  newLeague,
  newPerson,
  one,
  type MadeLeague,
} from '../schema/schema.test-helper.ts';
import { eraseAccount } from './erase-account.ts';

let pglite: PGlite;
let db: DatabaseHandle;
let a: MadeLeague;
let b: MadeLeague;
beforeAll(async () => {
  pglite = await freshSchema();
  db = createDatabase({ kind: 'pglite', pglite });
  a = await newLeague(pglite);
  b = await newLeague(pglite);
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

const erase = (accountId: string) =>
  withTransaction(db, { accountId }, (scope) => eraseAccount(scope));

async function profileFor(accountId: string, relation: 'self' | 'guardian', profileId?: string) {
  const id =
    profileId ??
    (
      await one<{ id: string }>(
        pglite,
        "insert into profiles (first_name, last_name) values ('Made', 'Up') returning id",
      )
    ).id;
  await pglite.query(
    'insert into profile_access (account_id, profile_id, relation) values ($1, $2, $3)',
    [accountId, id, relation],
  );
  return id;
}

const count = async (sql: string, params: unknown[]) =>
  (await one<{ n: number }>(pglite, `select count(*)::int as n from (${sql}) as rows`, params)).n;

describe('eraseAccount (record 052)', () => {
  it('empties the row in place and removes what is the account’s alone', async () => {
    const signInId = crypto.randomUUID();
    const account = await newAccount(pglite, 'erase-me@example.test');
    await pglite.query(
      "update accounts set sign_in_id = $1, phone = '555-0100', last_seen_at = now() where id = $2",
      [signInId, account],
    );
    const self = await profileFor(account, 'self');
    const child = await profileFor(account, 'guardian');
    const otherParent = await newAccount(pglite);
    const shared = await profileFor(account, 'guardian');
    await profileFor(otherParent, 'guardian', shared);
    for (const league of [a, b]) {
      await pglite.query(
        "insert into role_grants (league_id, account_id, role) values ($1, $2, 'scorekeeper')",
        [league.leagueId, account],
      );
    }
    await pglite.exec(`
      insert into sign_in.users (user_id) values ('${signInId}');
      insert into sign_in.devices (user_id, device_id) values ('${signInId}', 'device-1');
      insert into sign_in.sessions (session_id, user_id, device_label, signed_in_at,
        last_active_at, last_sign_in_at, access_token_hash, access_expires_at, refresh_token_hash)
      values ('s-erase', '${signInId}', 'Phone', now(), now(), now(), 'access-erase', now(), 'refresh-erase');
      insert into sign_in.refresh_tokens (token_hash, session_id) values ('refresh-erase', 's-erase');
      insert into sign_in.codes (email, verify_type, expires_at, attempts_left)
      values ('erase-me@example.test', 'recovery', now() + interval '10 minutes', 5);
    `);

    expect(await erase(account)).toBe('erased');

    expect(
      await one(
        pglite,
        'select email, display_name, phone, last_seen_at, sign_in_id from accounts where id = $1',
        [account],
      ),
    ).toEqual({
      email: `${account}@erased.invalid`,
      display_name: null,
      phone: null,
      last_seen_at: null,
      sign_in_id: null,
    });
    expect(await count('select 1 from profile_access where account_id = $1', [account])).toBe(0);
    expect(await count('select 1 from profiles where id = any($1)', [[self, child]])).toBe(0);
    // A child another account also acts for stays with that account.
    expect(await count('select 1 from profile_access where profile_id = $1', [shared])).toBe(1);
    expect(
      await count('select 1 from role_grants where account_id = $1 and revoked_at is null', [
        account,
      ]),
    ).toBe(0);
    expect(
      await count(
        'select 1 from role_grants where account_id = $1 and revoked_by_account_id = $1',
        [account],
      ),
    ).toBe(2);
    for (const table of ['users', 'devices', 'sessions']) {
      expect(await count(`select 1 from sign_in.${table} where user_id = $1`, [signInId])).toBe(0);
    }
    expect(
      await count("select 1 from sign_in.refresh_tokens where session_id = 's-erase'", []),
    ).toBe(0);
    expect(
      await count("select 1 from sign_in.codes where email = 'erase-me@example.test'", []),
    ).toBe(0);
    // The other parent's account is untouched.
    expect(
      await count('select 1 from accounts where id = $1 and email like $2', [
        otherParent,
        '%@example.test',
      ]),
    ).toBe(1);
  });

  it('refuses, changing nothing, while the account owns a league', async () => {
    expect(await erase(a.ownerId)).toBe('owns-a-league');
    expect(
      await count("select 1 from accounts where id = $1 and email like '%@example.test'", [
        a.ownerId,
      ]),
    ).toBe(1);
  });

  it('refuses while one of its profiles is still linked to a league’s person', async () => {
    const account = await newAccount(pglite);
    const self = await profileFor(account, 'self');
    await newPerson(pglite, a.leagueId, { profileId: self });
    expect(await erase(account)).toBe('profile-in-a-league');
    expect(await count('select 1 from profile_access where account_id = $1', [account])).toBe(1);
  });

  it('needs the account set for the transaction', async () => {
    await expect(
      withTransaction(db, { leagueId: a.leagueId }, (scope) => eraseAccount(scope)),
    ).rejects.toThrow('needs a transaction opened for an account');
  });
});
