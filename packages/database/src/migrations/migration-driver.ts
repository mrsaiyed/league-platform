// What the migration runner needs from a database (T-48): SQL in, rows out, and
// one transaction at a time. PGlite (local work and tests) and any PostgreSQL
// address (through the pg driver) each supply it; the runner knows neither.

/** One connection, or one open transaction on it. */
export type SqlSession = {
  /** One statement, with `$1`-style parameters. */
  query<Row>(sql: string, params?: readonly unknown[]): Promise<{ rows: Row[] }>;
  /** A whole file of statements, with no parameters. */
  exec(sql: string): Promise<void>;
};

export type MigrationDriver = SqlSession & {
  /** Runs `fn` in one transaction: commits when it resolves, rolls back when it throws. */
  transaction<T>(fn: (tx: SqlSession) => Promise<T>): Promise<T>;
  /** Closes the connection. */
  close(): Promise<void>;
};
