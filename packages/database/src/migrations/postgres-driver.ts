// The migration driver for any PostgreSQL address, through the pg driver: how a
// hosted database such as Supabase is reached on release (T-48). The one caller for a
// hosted database is `npm run release -- --hosted` (step 2.95, record 101), run at a
// person's own terminal with the migration login given for that one command; that login
// is never a setting on the host (docs/operations/apply-migrations.md).
//
// It needs a session-level connection: one connection held for the whole run, so the
// run lock and each transaction's limits stay on it. A pooler in transaction mode
// (Supabase's port 6543, PgBouncer in transaction mode) hands each statement to
// whichever connection is free, which breaks the lock and can split a migration's
// transaction. Use the direct address (Supabase: port 5432 on db.<project>.supabase.co,
// IPv6 only on the free plan) or the pooler in session mode (port 5432 on the pooler's
// host), which also answers over IPv4 (to confirm on the test copy).
//
// The release always checks the certificate ('verify', with PLATFORM_DATABASE_CA as
// `ca`, step 2.203); 'no-verify' and 'off' are never its choice. Tested against PGlite
// over a local socket and PostgreSQL 16 on this computer (tests/real-postgres); not yet
// run against the hosted test copy (the supervised session's step 6, audit 2.110).
import pg from 'pg';
import type { MigrationDriver, SqlSession } from './migration-driver.ts';

export type PostgresDriverOptions = {
  /**
   * - `'verify'` (default): SSL, and the server's certificate must be valid,
   *   checked against `ca` when given, else the system's certificate authorities.
   * - `'no-verify'`: SSL without checking the certificate. An explicit opt-out,
   *   only for a provider whose certificate cannot be checked.
   * - `'off'`: no SSL. Only for a database on this computer.
   */
  ssl?: 'verify' | 'no-verify' | 'off';
  /** The server's certificate authority, as PEM text. */
  ca?: string | undefined;
  /** How long connecting may take, in ms, before it fails. Default 15 000. */
  connectionTimeoutMillis?: number;
};

/** Where the connection really went, as pg read the address: host, port and user. */
export type ConnectedTo = { readonly host: string; readonly port: number; readonly user: string };

/** A migration driver on a PostgreSQL connection, which also says where it went. */
export type PostgresDriver = MigrationDriver & { readonly connectedTo: ConnectedTo };

type SslSetting = false | { rejectUnauthorized: boolean; ca?: string };

/** The pg `ssl` setting for `options`. */
export function sslSetting(options: PostgresDriverOptions): SslSetting {
  if (options.ssl === 'off') return false;
  if (options.ssl === 'no-verify') return { rejectUnauthorized: false };
  return options.ca ? { rejectUnauthorized: true, ca: options.ca } : { rejectUnauthorized: true };
}

/**
 * Every query string key pg-connection-string (the parser `pg` uses) reads that changes
 * whether the connection is encrypted or which certificate is trusted: `ssl` (0, 1,
 * true, no-verify), `sslmode`, `sslcert`, `sslkey`, `sslrootcert` (it reads those
 * files), `sslnegotiation` (direct turns SSL on, dropping a given certificate) and
 * `uselibpqcompat`. `pg` lets the address win over its `ssl` option, so all of them
 * are taken out before an address is handed to `pg`: `ssl` alone decides.
 */
export const sslAddressKeys = [
  'ssl',
  'sslmode',
  'sslcert',
  'sslkey',
  'sslrootcert',
  'sslnegotiation',
  'uselibpqcompat',
] as const;

/** The address with every key of sslAddressKeys taken out, in any capitals. */
export function withoutSslKeys(url: string): string {
  const target = new URL(url);
  const strip = new Set<string>(sslAddressKeys);
  for (const key of [...target.searchParams.keys()]) {
    if (strip.has(key.toLowerCase())) target.searchParams.delete(key);
  }
  return target.toString();
}

/** Connects to `url` (a postgres:// address). `close()` ends the connection. */
export async function connectPostgresDriver(
  url: string,
  options: PostgresDriverOptions = {},
): Promise<PostgresDriver> {
  // SSL is set here, not by the address, so a copied address behaves the same everywhere.
  const client = new pg.Client({
    connectionString: withoutSslKeys(url),
    ssl: sslSetting(options),
    // A server that never answers is given up on, with a plain message from the caller.
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 15_000,
  });

  // A dropped connection emits 'error'; unhandled, it would end the process. Remember
  // it, and fail every later call with it instead.
  let lost: Error | undefined;
  client.on('error', (error) => {
    lost = error;
  });
  const alive = () => {
    if (lost) throw new Error(`The database connection was lost: ${lost.message}`);
  };
  await client.connect();

  const session: SqlSession = {
    async query<Row>(sql: string, params: readonly unknown[] = []) {
      alive();
      const result = await client.query(sql, [...params]);
      return { rows: result.rows as Row[] };
    },
    async exec(sql: string) {
      alive();
      // No parameters: pg sends it as one simple query, so a file may hold many statements.
      await client.query(sql);
    },
  };

  return {
    ...session,
    async transaction(fn) {
      await session.exec('BEGIN');
      try {
        const result = await fn(session);
        await session.exec('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      }
    },
    close: () => client.end(),
    connectedTo: { host: client.host, port: client.port, user: client.user ?? '' },
  };
}
