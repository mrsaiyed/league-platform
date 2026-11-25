// readOwnName and renameOwnProfile (R-21, step 2.128): the account's own name, read and
// changed only for the account the transaction was opened for.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/create-database.ts';
import type { DatabaseHandle } from '../db/database-handle.ts';
import { withTransaction } from '../db/with-transaction.ts';
import { freshSchema, newAccount, one } from '../schema/schema.test-helper.ts';
import { createOwnProfile } from './create-own-profile.ts';
import { readOwnName } from './read-own-name.ts';
import { renameOwnProfile } from './rename-own-profile.ts';

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

const as = <T>(accountId: string, work: Parameters<typeof withTransaction<T>>[2]) =>
  withTransaction(db, { accountId }, work);

describe('readOwnName (step 2.128)', () => {
  it('is undefined until the account gives its name, then that name, for it alone', async () => {
    const ana = await newAccount(pglite);
    const ben = await newAccount(pglite);
    expect(await as(ana, (scope) => readOwnName(scope))).toBeUndefined();
    await as(ana, (scope) =>
      createOwnProfile(scope, { firstName: 'Ana', lastName: 'Made-up', birthDate: null }),
    );
    expect(await as(ana, (scope) => readOwnName(scope))).toEqual({
      firstName: 'Ana',
      lastName: 'Made-up',
    });
    expect(await as(ben, (scope) => readOwnName(scope))).toBeUndefined();
  });
});

describe('renameOwnProfile (step 2.128)', () => {
  it('changes the own profile and the display name the Admins page reads', async () => {
    const ana = await newAccount(pglite);
    await as(ana, (scope) =>
      createOwnProfile(scope, { firstName: 'Ana', lastName: 'Made-up', birthDate: null }),
    );
    expect(
      await as(ana, (scope) => renameOwnProfile(scope, { firstName: 'Ana', lastName: 'Other' })),
    ).toBe('renamed');
    expect(await as(ana, (scope) => readOwnName(scope))).toEqual({
      firstName: 'Ana',
      lastName: 'Other',
    });
    const row = await one<{ display_name: string }>(
      pglite,
      'select display_name from accounts where id = $1',
      [ana],
    );
    expect(row.display_name).toBe('Ana Other');
  });

  it('changes nothing for an account with no own profile, nor another account', async () => {
    const ana = await newAccount(pglite);
    const ben = await newAccount(pglite);
    await as(ben, (scope) =>
      createOwnProfile(scope, { firstName: 'Ben', lastName: 'Made-up', birthDate: null }),
    );
    expect(
      await as(ana, (scope) => renameOwnProfile(scope, { firstName: 'X', lastName: 'Y' })),
    ).toBe('no-own-profile');
    expect(await as(ben, (scope) => readOwnName(scope))).toEqual({
      firstName: 'Ben',
      lastName: 'Made-up',
    });
    const row = await one<{ display_name: string | null }>(
      pglite,
      'select display_name from accounts where id = $1',
      [ana],
    );
    expect(row.display_name).toBe('Made-up Person');
  });
});
