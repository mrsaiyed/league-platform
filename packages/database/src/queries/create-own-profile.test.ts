// createOwnProfile (record 052): the signed-in account's own profile, once, and only
// for the account the transaction was opened for.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { freshSchema, newAccount, newLeague, one } from '../schema/schema.test-helper.ts';
import { createOwnProfile } from './create-own-profile.ts';

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

const ana = { firstName: 'Ana', lastName: 'Made-up', birthDate: '1990-04-02' };

describe('createOwnProfile (record 052)', () => {
  it('makes the account’s own profile, which the account then sees as itself', async () => {
    const account = await newAccount(pglite);
    const made = await withTransaction(db, { accountId: account }, (scope) =>
      createOwnProfile(scope, ana),
    );
    if (made === 'already-has-one') throw new Error('expected a new profile');
    const row = await one(
      pglite,
      `select p.first_name, p.last_name, p.birth_date::text as birth_date, pa.relation
       from profiles p join profile_access pa on pa.profile_id = p.id
       where p.id = $1 and pa.account_id = $2`,
      [made.profileId, account],
    );
    expect(row).toEqual({
      first_name: 'Ana',
      last_name: 'Made-up',
      birth_date: '1990-04-02',
      relation: 'self',
    });
  });

  it('makes it once: a second answers that the account has one, and changes nothing', async () => {
    const account = await newAccount(pglite);
    const make = () =>
      withTransaction(db, { accountId: account }, (scope) =>
        createOwnProfile(scope, { firstName: 'Ben', lastName: 'Made-up', birthDate: null }),
      );
    expect(await make()).toHaveProperty('profileId');
    expect(await make()).toBe('already-has-one');
    const { n } = await one<{ n: number }>(
      pglite,
      'select count(*)::int as n from profile_access where account_id = $1',
      [account],
    );
    expect(n).toBe(1);
  });

  it('needs an account, and refuses names the profile rules refuse', async () => {
    const { leagueId } = await newLeague(pglite);
    await expect(
      withTransaction(db, { leagueId }, (scope) => createOwnProfile(scope, ana)),
    ).rejects.toThrow('needs a transaction opened for an account');
    const account = await newAccount(pglite);
    await expect(
      withTransaction(db, { accountId: account }, (scope) =>
        createOwnProfile(scope, { ...ana, firstName: '  ' }),
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
