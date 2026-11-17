// The made-up database served on this computer: reached through `pg` like a hosted one,
// as the login asked for, on 127.0.0.1 only.
import { describe, expect, it } from 'vitest';
import { checkLoginRole } from '../db/check-login-role.ts';
import { checkSignInStoreLogin } from '../db/check-sign-in-store-login.ts';
import { createDatabase } from '../db/create-database.ts';
import { databaseAnswers } from '../db/database-answers.ts';
import { serveMadeUpDatabase, type MadeUpDatabaseServerOptions } from './serve-made-up-database.ts';

const checksAs = async (login: MadeUpDatabaseServerOptions['login']) => {
  const served = await serveMadeUpDatabase(login === undefined ? {} : { login });
  const db = createDatabase({ kind: 'postgres', url: served.url, ssl: 'off', maxConnections: 2 });
  try {
    expect(new URL(served.url).hostname).toBe('localhost');
    expect(await databaseAnswers(db)).toBe(true);
    return { role: await checkLoginRole(db), store: await checkSignInStoreLogin(db) };
  } finally {
    await db.close();
    await served.close();
  }
};

describe('serveMadeUpDatabase', () => {
  it('is reached through pg as a login fit for the app, the sign-in store included', async () => {
    expect(await checksAs(undefined)).toEqual({ role: [], store: [] });
  }, 120_000);

  it('can be the superuser that built it, or a login without the sign-in store', async () => {
    expect((await checksAs('superuser')).role).toContain('it is a superuser');
    expect(await checksAs('no-sign-in-store')).toEqual({
      role: [],
      store: ['it is not a member of sign_in_store'],
    });
  }, 120_000);
});
