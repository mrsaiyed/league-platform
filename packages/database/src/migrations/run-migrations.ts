// Applies migrations in order (T-48). Each file runs in its own transaction
// together with the row that records it, so a file is either fully applied and
// recorded, or not at all. Applied files are recorded with their checksum; a run
// refuses to start if one of them was edited, renamed or removed since, because
// the database would no longer match the folder. Running again is a no-op.
//
// Runs are one at a time: each takes an advisory lock (a named lock held by the
// connection) and waits a bounded time for it. Inside each transaction the file's
// log row is checked again, so even two runs that both got past the lock cannot
// apply a file twice. Never throws: every problem comes back as an error result.
import { setTimeout as sleep } from 'node:timers/promises';
import type { MigrationDriver, SqlSession } from './migration-driver.ts';
import type {
  Migration,
  MigrationError,
  MigrationRunOptions,
  MigrationRunResult,
} from './migration-types.ts';
import { validateMigrations } from './validate-migrations.ts';

// The bookkeeping lives in its own schema, outside `public`, so the hosted API
// never exposes it. It is created here because the runner needs it before the
// first file runs; 0001_migration_log.sql then locks the schema down. History
// only, so no `updated_at` (T3 §1, T-45).
const bootstrap = `
create schema if not exists migration_log;
create table if not exists migration_log.applied (
  version integer primary key check (version > 0),
  name text not null unique,
  checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz not null default now()
);
`;

// The number is arbitrary; it only has to be the same for every run.
const lockKey = 4_820_481_183;

export const defaultMigrationRunOptions: Required<MigrationRunOptions> = {
  lockWaitMs: 60_000,
  lockPollMs: 500,
  lockTimeoutMs: 10_000,
  statementTimeoutMs: 600_000,
};

type AppliedRow = { version: number; name: string; checksum: string };

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Applies every migration not yet recorded, in order. */
export async function runMigrations(
  driver: MigrationDriver,
  migrations: readonly Migration[],
  options: MigrationRunOptions = {},
): Promise<MigrationRunResult> {
  const applied: string[] = [];
  const failed = (error: MigrationError): MigrationRunResult => ({ ok: false, error, applied });

  const settings = { ...defaultMigrationRunOptions, ...options };
  const bad = Object.entries(settings).find(([, ms]) => !Number.isSafeInteger(ms) || ms <= 0);
  if (bad) {
    return failed({
      code: 'invalid_options',
      message: `${bad[0]} must be a positive whole number of milliseconds.`,
    });
  }
  const problem = validateMigrations(migrations);
  if (problem) return failed(problem);

  const lock = await acquireLock(driver, settings);
  if (lock) return failed(lock);
  try {
    // Limits last only for the transaction they are set in (is_local = true).
    const limit = (tx: SqlSession) =>
      tx.query('select set_config($1, $2, true), set_config($3, $4, true)', [
        'lock_timeout',
        `${settings.lockTimeoutMs}ms`,
        'statement_timeout',
        `${settings.statementTimeoutMs}ms`,
      ]);

    try {
      await driver.transaction(async (tx) => {
        await limit(tx);
        await tx.exec(bootstrap);
      });
    } catch (error) {
      return failed({
        code: 'bootstrap_failed',
        message: `Cannot create the migration log: ${reasonOf(error)}`,
      });
    }

    let rows: AppliedRow[];
    try {
      rows = (
        await driver.query<AppliedRow>(
          'select version, name, checksum from migration_log.applied order by version',
        )
      ).rows;
    } catch (error) {
      return failed({
        code: 'log_unreadable',
        message: `Cannot read the migration log: ${reasonOf(error)}`,
      });
    }

    // An empty list against a used database is a wrong folder, not a reversed release.
    const last = migrations.at(-1)?.version ?? 0;
    if (last === 0 && rows[0]) return failed(missing(rows[0], undefined));
    const byVersion = new Map(migrations.map((m) => [m.version, m]));
    for (const row of rows) {
      if (row.version > last) continue;
      const mismatch = compare(row, byVersion.get(row.version));
      if (mismatch) return failed(mismatch);
    }

    const done = new Set(rows.map((row) => row.version));
    const alreadyApplied = migrations.filter((m) => done.has(m.version)).map((m) => m.name);
    const newerInDatabase = rows.filter((row) => row.version > last).map((row) => row.name);
    for (const migration of migrations) {
      if (done.has(migration.version)) continue;
      let existing: AppliedRow | undefined;
      try {
        existing = await driver.transaction(async (tx) => {
          await limit(tx);
          // Another run may have applied it while this one read the log.
          const found = await tx.query<AppliedRow>(
            'select version, name, checksum from migration_log.applied where version = $1 for update',
            [migration.version],
          );
          if (found.rows[0]) return found.rows[0];
          await tx.exec(migration.sql);
          await tx.query(
            'insert into migration_log.applied (version, name, checksum) values ($1, $2, $3)',
            [migration.version, migration.name, migration.checksum],
          );
          return undefined;
        });
      } catch (error) {
        return failed({
          code: 'migration_failed',
          file: migration.name,
          message: `${migration.name} failed and was rolled back: ${reasonOf(error)}`,
        });
      }
      if (existing) {
        const mismatch = compare(existing, migration);
        if (mismatch) return failed(mismatch);
        alreadyApplied.push(migration.name);
      } else applied.push(migration.name);
    }
    return { ok: true, value: { applied, alreadyApplied, newerInDatabase } };
  } finally {
    await driver.query('select pg_advisory_unlock($1::bigint)', [lockKey]).catch(() => {});
  }
}

/** Whether a recorded row still matches the file of that number. */
function compare(row: AppliedRow, file: Migration | undefined): MigrationError | undefined {
  if (!file || file.name !== row.name) return missing(row, file);
  if (file.checksum !== row.checksum) {
    return {
      code: 'applied_file_changed',
      file: row.name,
      message:
        `${row.name} was edited after it was applied. Put it back as it was and make the ` +
        'change in a new migration.',
    };
  }
  return undefined;
}

function missing(row: AppliedRow, file: Migration | undefined): MigrationError {
  return {
    code: 'applied_file_missing',
    file: row.name,
    message:
      `${row.name} was applied to this database but is not in the migrations folder` +
      (file ? ` (number ${row.version} is now ${file.name})` : '') +
      '. Applied files are never renamed or removed: restore it.',
  };
}

/** Takes the run lock, waiting up to `lockWaitMs`. Returns an error, or undefined once held. */
async function acquireLock(
  driver: MigrationDriver,
  settings: Required<MigrationRunOptions>,
): Promise<MigrationError | undefined> {
  const started = Date.now();
  for (;;) {
    let locked: boolean;
    try {
      const { rows } = await driver.query<{ locked: boolean }>(
        'select pg_try_advisory_lock($1::bigint) as locked',
        [lockKey],
      );
      locked = rows[0]?.locked === true;
    } catch (error) {
      return {
        code: 'lock_failed',
        message: `Cannot take the migration lock: ${reasonOf(error)}`,
      };
    }
    if (locked) return undefined;
    const waited = Date.now() - started;
    if (waited >= settings.lockWaitMs) {
      return {
        code: 'lock_timeout',
        message:
          `Another migration run held the lock for more than ${settings.lockWaitMs} ms. ` +
          'Nothing was applied; run again once it has finished.',
      };
    }
    await sleep(Math.min(settings.lockPollMs, settings.lockWaitMs - waited));
  }
}
