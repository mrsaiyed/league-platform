// The migration driver for any PostgreSQL address, through the pg driver: how a
// hosted database such as Supabase is reached on release (T-48).
//
// It needs a direct, session-level connection: one connection held for the whole
// run, so the run lock and each transaction's limits stay on it. A pooler in
// transaction mode (Supabase's port 6543, PgBouncer in transaction mode) hands each
// statement to whichever connection is free, which breaks the lock and can split a
// migration's transaction. Use the direct address (Supabase: port 5432, or the
// pooler in session mode).
//
// Tested here against PGlite over a local socket; not yet run against a hosted
// database (there are no vendor accounts yet).
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
};

type SslSetting = false | { rejectUnauthorized: boolean; ca?: string };

/** The pg `ssl` setting for `options`. */
export function sslSetting(options: PostgresDriverOptions): SslSetting {
  if (options.ssl === 'off') return false;
  if (options.ssl === 'no-verify') return { rejectUnauthorized: false };
  return options.ca ? { rejectUnauthorized: true, ca: options.ca } : { rejectUnauthorized: true };
}

/** Connects to `url` (a postgres:// address). `close()` ends the connection. */
export async function connectPostgresDriver(
  url: string,
  options: PostgresDriverOptions = {},
): Promise<MigrationDriver> {
  // SSL is set here, not by the address, so a copied address behaves the same everywhere.
  const target = new URL(url);
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat'])
    target.searchParams.delete(key);
  const client = new pg.Client({ connectionString: target.toString(), ssl: sslSetting(options) });

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
  };
}
