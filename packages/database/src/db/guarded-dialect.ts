// Wraps a dialect so that no query can run outside the transaction it was written
// for (T-61). Without this, a query still in flight when withTransaction's work
// returned or threw (one not awaited, or a sibling in a Promise.all that rejected)
// would reach the connection after COMMIT or ROLLBACK: as the login role, with no
// league set, or inside the next request's transaction.
//
// - A connection runs queries only while it is held, and stops before its
//   transaction ends: commit and rollback first refuse new queries, then wait for
//   the ones already running, then end the transaction.
// - Inside withTransaction's work no second connection is handed out: a nested
//   withTransaction or a query on the bare handle is refused, not run unfenced.
import type {
  AbortableOperationOptions,
  CompiledQuery,
  DatabaseConnection,
  Dialect,
  Driver,
  QueryResult,
  TransactionSettings,
} from 'kysely';
import { workInProgress } from './transaction-scope.ts';

class GuardedConnection implements DatabaseConnection {
  open = true;
  readonly running = new Set<Promise<unknown>>();
  constructor(readonly inner: DatabaseConnection) {}

  #refuseWhenClosed() {
    if (!this.open) {
      throw new Error(
        'Query refused: its transaction has ended or is ending. Await every query inside withTransaction.',
      );
    }
  }

  async executeQuery<R>(
    query: CompiledQuery,
    options?: AbortableOperationOptions,
  ): Promise<QueryResult<R>> {
    this.#refuseWhenClosed();
    const run = this.inner.executeQuery<R>(query, options);
    this.running.add(run);
    const forget = () => this.running.delete(run);
    run.then(forget, forget);
    return run;
  }

  streamQuery<R>(
    query: CompiledQuery,
    chunkSize: number,
    options?: AbortableOperationOptions,
  ): AsyncIterableIterator<QueryResult<R>> {
    this.#refuseWhenClosed();
    return this.inner.streamQuery<R>(query, chunkSize, options);
  }

  /** Refuses new queries and waits for the running ones to finish. */
  async close() {
    this.open = false;
    await Promise.allSettled([...this.running]);
  }
}

function guarded(connection: DatabaseConnection): GuardedConnection {
  if (!(connection instanceof GuardedConnection)) {
    throw new Error('The guarded driver was handed a connection it did not make.');
  }
  return connection;
}

function guardedDriver(inner: Driver): Driver {
  return {
    init: () => inner.init(),
    async acquireConnection() {
      if (workInProgress.getStore() !== undefined) {
        throw new Error(
          'A second connection was asked for inside withTransaction: use the scope you were given, not the database handle or another withTransaction.',
        );
      }
      return new GuardedConnection(await inner.acquireConnection());
    },
    beginTransaction: (connection: DatabaseConnection, settings: TransactionSettings) =>
      inner.beginTransaction(guarded(connection).inner, settings),
    async commitTransaction(connection) {
      const held = guarded(connection);
      await held.close();
      await inner.commitTransaction(held.inner);
    },
    async rollbackTransaction(connection) {
      const held = guarded(connection);
      await held.close();
      await inner.rollbackTransaction(held.inner);
    },
    async releaseConnection(connection) {
      const held = guarded(connection);
      await held.close();
      await inner.releaseConnection(held.inner);
    },
    destroy: () => inner.destroy(),
  };
}

/** The same dialect, with every connection guarded as described above. */
export function guardedDialect(inner: Dialect): Dialect {
  return {
    createAdapter: () => inner.createAdapter(),
    createDriver: () => guardedDriver(inner.createDriver()),
    createQueryCompiler: () => inner.createQueryCompiler(),
    createIntrospector: (kysely) => inner.createIntrospector(kysely),
  };
}
