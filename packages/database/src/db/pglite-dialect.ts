// A Kysely dialect for PGlite: real PostgreSQL inside Node, for local work and every
// database test. PostgreSQL's own adapter, query compiler and introspector; only
// the connection is ours.
//
// PGlite is one connection. Kysely asks for a connection per query or transaction,
// so callers queue here and take turns: a transaction holds the connection until it
// commits or rolls back, and each turn gets its own connection object, which
// refuses queries once the turn is over. Nothing else may use the same PGlite
// instance while a transaction is open, or its statements would land inside it.
import { types, type PGlite } from '@electric-sql/pglite';
import {
  CompiledQuery,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseConnection,
  type Dialect,
  type Driver,
  type QueryResult,
  type TransactionSettings,
} from 'kysely';

// A `date` is read as its text, YYYY-MM-DD, as the pg dialect does (create-database.ts):
// a Date object would carry a time zone the value does not have.
const parsers = { [types.DATE]: (value: string) => value };

/** A connection for one turn: it refuses every query once the turn has ended. */
function connectionFor(db: PGlite, holdsTurn: () => boolean): DatabaseConnection {
  return {
    async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
      if (!holdsTurn()) {
        throw new Error('PGlite query refused: this connection no longer holds its turn.');
      }
      const result = await db.query<R>(query.sql, [...query.parameters], { parsers });
      return result.affectedRows === undefined
        ? { rows: result.rows }
        : { rows: result.rows, numAffectedRows: BigInt(result.affectedRows) };
    },
    streamQuery() {
      throw new Error('The PGlite dialect does not stream query results.');
    },
  };
}

function beginStatement(settings: TransactionSettings): string {
  if (!settings.isolationLevel && !settings.accessMode) return 'begin';
  const parts = ['start transaction'];
  if (settings.isolationLevel) parts.push(`isolation level ${settings.isolationLevel}`);
  if (settings.accessMode) parts.push(settings.accessMode);
  return parts.join(' ');
}

function driverFor(db: PGlite): Driver {
  let turn: Promise<void> = Promise.resolve();
  let holder: DatabaseConnection | undefined;
  let endTurn = () => {};
  const run = async (connection: DatabaseConnection, sql: string) => {
    await connection.executeQuery(CompiledQuery.raw(sql));
  };
  return {
    async init() {},
    async acquireConnection() {
      const previous = turn;
      let done = () => {};
      turn = new Promise<void>((resolve) => {
        done = resolve;
      });
      await previous;
      const connection = connectionFor(db, () => holder === connection);
      holder = connection;
      endTurn = done;
      return connection;
    },
    beginTransaction: (connection, settings) => run(connection, beginStatement(settings)),
    commitTransaction: (connection) => run(connection, 'commit'),
    rollbackTransaction: (connection) => run(connection, 'rollback'),
    async releaseConnection(connection) {
      if (connection !== holder) return;
      holder = undefined;
      endTurn();
    },
    // The PGlite instance belongs to whoever opened it; they close it.
    async destroy() {},
  };
}

/** A Kysely dialect over an open PGlite database. Closing Kysely leaves PGlite open. */
export function pgliteDialect(db: PGlite): Dialect {
  return {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => driverFor(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
    createIntrospector: (kysely) => new PostgresIntrospector(kysely),
  };
}
