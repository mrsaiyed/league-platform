// The shapes the migration runner works with and the problems it can report.

/** One numbered file from supabase/migrations, e.g. `0001_migration_log.sql`. */
export type Migration = {
  /** The number at the start of the file name: 1 for `0001_...`. */
  version: number;
  /** The file name, e.g. `0001_migration_log.sql`. */
  name: string;
  /** The text to run: byte-order mark removed, LF line endings. */
  sql: string;
  /** SHA-256 of `sql` (see checksum.ts). */
  checksum: string;
};

export type MigrationErrorCode =
  /** The migrations folder could not be read. */
  | 'folder_unreadable'
  /** A sub-folder or symbolic link in the migrations folder. */
  | 'unexpected_entry'
  /** A migration file could not be read. */
  | 'file_unreadable'
  /** A .sql file whose name is not `NNNN_lower_snake_name.sql`, or whose number does not match. */
  | 'bad_file_name'
  /** A migration handed to the runner whose checksum does not match its text. */
  | 'bad_checksum'
  /** Two files with the same number. */
  | 'duplicate_version'
  /** The numbers do not run 1, 2, 3, ... in order without a gap. */
  | 'version_gap'
  /** A file with nothing to run (empty, or only comments). */
  | 'empty_file'
  /** A file that begins, ends or splits a transaction itself (BEGIN, COMMIT, SAVEPOINT, ...). */
  | 'transaction_control'
  /** The run's options are not positive whole numbers. */
  | 'invalid_options'
  /** The database refused the lock that keeps runs one at a time. */
  | 'lock_failed'
  /** Another run held the lock for longer than the run was willing to wait. */
  | 'lock_timeout'
  /** The migration log could not be created. */
  | 'bootstrap_failed'
  /** The migration log could not be read. */
  | 'log_unreadable'
  /** A file recorded as applied is no longer in the folder (or was renamed). */
  | 'applied_file_missing'
  /** A file recorded as applied has been edited since. Add a new migration instead. */
  | 'applied_file_changed'
  /** A migration failed; its transaction was rolled back. */
  | 'migration_failed';

export type MigrationError = { code: MigrationErrorCode; message: string; file?: string };

export type MigrationResult<T> = { ok: true; value: T } | { ok: false; error: MigrationError };

/** What a run did. Names are file names, in order. */
export type MigrationRun = {
  /** Applied by this run. */
  applied: string[];
  /** Already applied before (or by another run while this one waited). */
  alreadyApplied: string[];
  /**
   * Recorded in the database but numbered after the last file in the folder: the
   * database is ahead of this version of the code, as after a release is reversed
   * (T-156). Nothing to do, so not an error.
   */
  newerInDatabase: string[];
};

/** A failed run still reports what it applied before the failure. */
export type MigrationRunResult =
  | { ok: true; value: MigrationRun }
  | { ok: false; error: MigrationError; applied: string[] };

/** Limits for one run. Every value is in milliseconds and a positive whole number. */
export type MigrationRunOptions = {
  /** How long to wait for another run to finish before giving up. Default 60 s. */
  lockWaitMs?: number;
  /** How often to try the lock again while waiting. Default 500 ms. */
  lockPollMs?: number;
  /**
   * Longest a statement waits for a table lock (PostgreSQL `lock_timeout`). Short,
   * so a migration that cannot get its lock fails instead of stalling the app's
   * queries queued behind it. Default 10 s.
   */
  lockTimeoutMs?: number;
  /** Longest one statement may run (PostgreSQL `statement_timeout`). Default 10 min. */
  statementTimeoutMs?: number;
};
