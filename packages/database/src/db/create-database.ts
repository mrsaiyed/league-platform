// The one place that chooses how the app reaches PostgreSQL (T1 §1: Kysely over
// the schema). PGlite for local work and tests; any PostgreSQL address, through a
// pg pool, for real use. Both read rows the same way: a `date` as YYYY-MM-DD text,
// a `timestamptz` as a Date, `jsonb` as parsed JSON.
//
// The address must log in as the app's restricted role, app_user (T-60), or as a
// login role that is a member of it, and never as a superuser, a role that bypasses
// row-level security, or the tables' owner. withTransaction switches every
// transaction to app_user in any case, so row-level security applies (T-61), but a
// query that ever escaped a transaction would run with the login role's powers.
// checkLoginRole reports a login that breaks this rule; the app calls it at startup.
//
// Every connection is guarded (guarded-dialect.ts): no query runs outside the
// transaction it was written for.
import type { PGlite } from '@electric-sql/pglite';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { sslSetting, type PostgresDriverOptions } from '../migrations/postgres-driver.ts';
import { handleFor, type DatabaseHandle } from './database-handle.ts';
import { guardedDialect } from './guarded-dialect.ts';
import { pgliteDialect } from './pglite-dialect.ts';
import type { Database } from './schema-types.ts';

export type DatabaseSource =
  | { kind: 'pglite'; pglite: PGlite }
  | ({
      kind: 'postgres';
      /** A postgres:// address. SSL is set by `ssl`, never by the address. */
      url: string;
      /** The most connections the pool opens at once. Default 10. */
      maxConnections?: number;
      /** How long to wait for a free connection before failing, in ms. Default 10 000. */
      connectionTimeoutMillis?: number;
      /**
       * Told when an idle connection drops (the server restarted, the network broke).
       * The pool has already discarded that connection and opens a new one for the
       * next query, so this is for logging only. Default: nothing is done.
       */
      onIdleError?: (error: Error) => void;
    } & PostgresDriverOptions);

const dateOid = 1082;

function postgresDialect(source: Extract<DatabaseSource, { kind: 'postgres' }>) {
  const target = new URL(source.url);
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat'])
    target.searchParams.delete(key);
  const pool = new pg.Pool({
    connectionString: target.toString(),
    ssl: sslSetting(source),
    max: source.maxConnections ?? 10,
    connectionTimeoutMillis: source.connectionTimeoutMillis ?? 10_000,
    types: {
      getTypeParser: ((oid: number, format?: 'text' | 'binary') =>
        oid === dateOid
          ? (value: string) => value
          : pg.types.getTypeParser(oid, format)) as typeof pg.types.getTypeParser,
    },
  });
  // A connection that drops while idle emits 'error' on the pool; with no listener
  // it would end the process. Nothing is lost (see onIdleError), so it is passed on
  // for logging, not thrown.
  pool.on('error', (error) => source.onIdleError?.(error));
  return new PostgresDialect({ pool });
}

/** Opens the database. Close the handle when done. */
export function createDatabase(source: DatabaseSource): DatabaseHandle {
  const dialect = source.kind === 'pglite' ? pgliteDialect(source.pglite) : postgresDialect(source);
  return handleFor(new Kysely<Database>({ dialect: guardedDialect(dialect) }));
}
