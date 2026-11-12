// The migration driver for PGlite: real PostgreSQL inside Node, for local work
// and every database test.
import type { PGlite, Transaction } from '@electric-sql/pglite';
import type { MigrationDriver, SqlSession } from './migration-driver.ts';

function session(db: PGlite | Transaction): SqlSession {
  return {
    async query<Row>(sql: string, params: readonly unknown[] = []) {
      const result = await db.query<Row>(sql, [...params]);
      return { rows: result.rows };
    },
    async exec(sql: string) {
      await db.exec(sql);
    },
  };
}

/** Wraps an open PGlite database. `close()` closes it. */
export function pgliteDriver(db: PGlite): MigrationDriver {
  return {
    ...session(db),
    transaction: (fn) => db.transaction((tx) => fn(session(tx))),
    close: () => db.close(),
  };
}
