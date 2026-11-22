// The made-up database served on this computer: reached through `pg` like a hosted one,
// as the login asked for, on 127.0.0.1 only.
import { Socket } from 'node:net';
import pg from 'pg';
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

  it('closes cleanly just after a client leaves mid-transaction, or with one still connected', async () => {
    // The race GitHub's machine lost: the socket server rolls a departed client back on its
    // own, a moment later, and that reached PGlite after it was closed (an error nothing
    // could catch). Closed 0 to 3 ms after the client leaves, then once with it still there.
    const uncaught: unknown[] = [];
    const keep = (error: unknown) => uncaught.push(error);
    process.on('unhandledRejection', keep);
    try {
      for (const wait of [0, 1, 2, 3, -1]) {
        const served = await serveMadeUpDatabase();
        const socket = new Socket();
        const client = new pg.Client({
          connectionString: served.url,
          ssl: false,
          stream: () => socket,
        });
        client.on('error', () => undefined);
        await client.connect();
        await client.query('begin');
        await client.query('select 1');
        if (wait >= 0) {
          socket.destroy();
          await new Promise((resolve) => setTimeout(resolve, wait));
        }
        await served.close();
        await new Promise((resolve) => setTimeout(resolve, 200));
        if (wait < 0) await client.end().catch(() => undefined);
      }
      expect(uncaught.map(String)).toEqual([]);
    } finally {
      process.off('unhandledRejection', keep);
    }
  }, 120_000);

  it('can be the superuser that built it, or a login without the sign-in store', async () => {
    expect((await checksAs('superuser')).role).toContain(
      'postgres is a superuser: alter role postgres nosuperuser',
    );
    expect(await checksAs('no-sign-in-store')).toEqual({
      role: [],
      store: ['it is not a member of sign_in_store'],
    });
  }, 120_000);
});
