// The made-up database (made-up-database.ts) served on this computer as a PostgreSQL
// server, so the web app can be started in staging mode exactly as it starts on a hosted
// database, with a `postgres://` address, the `pg` driver and its pool, and nothing else
// standing in (step 2.93's last part: the test of the real wiring in container.ts, and the
// browser test of the test copy). For tests and local trials only (T-201): it holds the
// made-up seed leagues only, listens on 127.0.0.1 only, on a port the system picks, and
// speaks no SSL, so the address names localhost and needs PLATFORM_DATABASE_SSL=off. It
// is gone when closed.
//
// One PGlite answers every connection, one statement at a time, as the session it was
// built in: as the made-up login (fit for the app), or, for the start-up refusals'
// tests, as the superuser that built it, or as a login that is not a member of
// sign_in_store. The socket server is loaded only when this is called, never by the app.
import type { PGlite } from '@electric-sql/pglite';
import {
  madeUpDatabase,
  madeUpLoginRole,
  type MadeUpLeague,
  type MadeUpOptions,
} from './made-up-database.ts';

export type MadeUpDatabaseServerOptions = MadeUpOptions & {
  /**
   * Who every connection is: `fit` (the default), the made-up login a hosted login must be
   * like; `superuser`, the role that built it, which start-up must refuse; or
   * `no-sign-in-store`, the made-up login without its membership of sign_in_store.
   */
  readonly login?: 'fit' | 'superuser' | 'no-sign-in-store';
};

export type MadeUpDatabaseServer = {
  /** Its `postgres://` address on this computer, with no password (none is asked). */
  readonly url: string;
  /** The seed leagues it holds. */
  readonly leagues: readonly MadeUpLeague[];
  /** Stops the server and ends the database; everything in it is gone. */
  readonly close: () => Promise<void>;
};

async function loginAs(pglite: PGlite, login: MadeUpDatabaseServerOptions['login']) {
  if (login === 'superuser') {
    await pglite.exec('set session authorization postgres');
  } else if (login === 'no-sign-in-store') {
    await pglite.exec(`
      set session authorization postgres;
      revoke sign_in_store from ${madeUpLoginRole};
      set session authorization ${madeUpLoginRole};
    `);
  }
}

/**
 * The database as the socket server sees it: once closing has begun it starts nothing more
 * on PGlite. The socket server tidies a connection up without waiting (a client that
 * leaves mid-transaction is rolled back later, on its own), so that tidying can reach
 * PGlite after it is closed and fail where nothing can catch it, which ends the process.
 * After closing begins, it is told there is no transaction to roll back (the database is
 * being thrown away), and any statement is refused with an error the socket server
 * handles. Work already started finishes before PGlite closes.
 */
function startsNothingOnceClosing(pglite: PGlite, closing: () => boolean): PGlite {
  const refused = new Set<PropertyKey>(['exec', 'query', 'runExclusive', 'execProtocolRawStream']);
  return new Proxy(pglite, {
    get(target, key) {
      if (key === 'isInTransaction') return () => !closing() && target.isInTransaction();
      const value: unknown = Reflect.get(target, key, target);
      if (typeof value !== 'function') return value;
      const method = value as (...args: unknown[]) => unknown;
      return (...args: unknown[]) =>
        refused.has(key) && closing()
          ? Promise.reject(new Error('The made-up database is closed.'))
          : Reflect.apply(method, target, args);
    },
  });
}

/** Starts a made-up database served on 127.0.0.1. Close it when done. */
export async function serveMadeUpDatabase(
  options: MadeUpDatabaseServerOptions = {},
): Promise<MadeUpDatabaseServer> {
  const made = await madeUpDatabase(options);
  if (made.source.kind !== 'pglite') throw new Error('The made-up database is not in memory.');
  const pglite = made.source.pglite;
  try {
    await loginAs(pglite, options.login);
    const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
    // A pool's worth of connections; one statement runs at a time all the same.
    let closing = false;
    const server = new PGLiteSocketServer({
      db: startsNothingOnceClosing(pglite, () => closing),
      host: '127.0.0.1',
      port: 0,
      maxConnections: 32,
    });
    await server.start();
    const port = Number(server.getServerConn().split(':').at(-1));
    return {
      url: `postgres://${madeUpLoginRole}@localhost:${port}/postgres`,
      leagues: made.leagues,
      close: async () => {
        // In this order: nothing new reaches PGlite, the connections end, then PGlite closes
        // (after the statements already queued on it).
        closing = true;
        await server.stop();
        await made.close();
      },
    };
  } catch (error) {
    await made.close();
    throw error;
  }
}
