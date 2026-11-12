// T3 §3: accounts, profiles and who may act for whom.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshSchema, newAccount, one, refused, unique } from './schema.test-helper.ts';

let db: PGlite;
beforeAll(async () => {
  db = await freshSchema();
});
afterAll(async () => {
  await db.close();
});

const newProfile = async () =>
  (
    await one<{ id: string }>(
      db,
      "insert into profiles (first_name, last_name) values ('Made', 'Up') returning id",
    )
  ).id;

const grantAccess = (accountId: string, profileId: string, relation: string) =>
  db.query('insert into profile_access (account_id, profile_id, relation) values ($1, $2, $3)', [
    accountId,
    profileId,
    relation,
  ]);

describe('accounts', () => {
  it('have one account per email, whatever its capitals', async () => {
    const email = `${unique('sam')}@example.test`;
    await newAccount(db, email);
    await expect(newAccount(db, email.toUpperCase())).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'accounts_email_key',
    });
  });

  it('refuse an email that is not one', async () => {
    for (const email of ['no-at-sign', ' padded@example.test', 'two@@example.test', 'a b@x.test']) {
      await expect(newAccount(db, email)).rejects.toMatchObject({
        ...refused.check,
        constraint: 'accounts_email_format',
      });
    }
  });
});

describe('profile_access', () => {
  it('lets an account act for itself and as guardian for several children', async () => {
    const parent = await newAccount(db);
    await grantAccess(parent, await newProfile(), 'self');
    await grantAccess(parent, await newProfile(), 'guardian');
    await grantAccess(parent, await newProfile(), 'guardian');
  });

  it('lets two guardians act for one child', async () => {
    const child = await newProfile();
    await grantAccess(await newAccount(db), child, 'guardian');
    await grantAccess(await newAccount(db), child, 'guardian');
  });

  it('knows only self and guardian', async () => {
    await expect(
      grantAccess(await newAccount(db), await newProfile(), 'friend'),
    ).rejects.toMatchObject({ ...refused.check, constraint: 'profile_access_relation' });
  });

  it('allows one self per account, and one account per self', async () => {
    const account = await newAccount(db);
    const self = await newProfile();
    await grantAccess(account, self, 'self');
    await expect(grantAccess(account, await newProfile(), 'self')).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'profile_access_one_self_per_account',
    });
    await expect(grantAccess(await newAccount(db), self, 'self')).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'profile_access_one_self_per_profile',
    });
  });

  it('records an account and profile pair once', async () => {
    const account = await newAccount(db);
    const child = await newProfile();
    await grantAccess(account, child, 'guardian');
    await expect(grantAccess(account, child, 'guardian')).rejects.toMatchObject({
      ...refused.unique,
      constraint: 'profile_access_once',
    });
  });

  it('points only at accounts and profiles that exist', async () => {
    await expect(
      grantAccess(await newAccount(db), '00000000-0000-7000-8000-000000000000', 'guardian'),
    ).rejects.toMatchObject(refused.foreignKey);
  });
});
