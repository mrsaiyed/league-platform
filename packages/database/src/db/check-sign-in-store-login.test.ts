// Record 052: the app's login must reach the sign-in store as sign_in_store; the web app
// asks at start-up and refuses on any problem (step 2.93's last part).
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshSchema } from '../schema/schema.test-helper.ts';
import { checkSignInStoreLogin } from './check-sign-in-store-login.ts';
import { createDatabase } from './create-database.ts';
import { databaseAnswers } from './database-answers.ts';
import type { DatabaseHandle } from './database-handle.ts';

let pglite: PGlite;
let db: DatabaseHandle;
beforeAll(async () => {
  pglite = await freshSchema();
  await pglite.exec(`
    create role made_up_store_login login;
    grant app_user to made_up_store_login;
    grant sign_in_store to made_up_store_login;
    create role made_up_no_store_login login;
    grant app_user to made_up_no_store_login;
  `);
  db = createDatabase({ kind: 'pglite', pglite });
});
afterAll(async () => {
  await db.close();
  await pglite.close();
});

/** Runs the check logged in as `login` (the session's own user, as a hosted login is). */
const checkAs = async (login: string) => {
  await pglite.exec(`set session authorization ${login}`);
  try {
    return await checkSignInStoreLogin(db);
  } finally {
    await pglite.exec('reset session authorization');
  }
};

describe('checkSignInStoreLogin', () => {
  it('accepts a login that is a member of sign_in_store and can switch to it', async () => {
    expect(await checkAs('made_up_store_login')).toEqual([]);
  });

  it('reports a login that is not a member of sign_in_store', async () => {
    expect(await checkAs('made_up_no_store_login')).toEqual([
      'it is not a member of sign_in_store',
    ]);
  });

  it('reports a database whose migrations never made the role', async () => {
    const bare = new PGlite();
    const bareDb = createDatabase({ kind: 'pglite', pglite: bare });
    try {
      expect(await checkSignInStoreLogin(bareDb)).toEqual([
        'the role sign_in_store does not exist (the migrations are not all applied)',
      ]);
    } finally {
      await bareDb.close();
      await bare.close();
    }
  });
});

describe('databaseAnswers', () => {
  it('is true while the database answers, and false, never an error, once it does not', async () => {
    expect(await databaseAnswers(db)).toBe(true);
    const gone = new PGlite();
    const goneDb = createDatabase({ kind: 'pglite', pglite: gone });
    await gone.close();
    expect(await databaseAnswers(goneDb)).toBe(false);
    await goneDb.close().catch(() => {});
  });
});
