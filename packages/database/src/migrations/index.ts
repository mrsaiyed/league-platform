// The migration runner (T-48): the only way the schema changes. Used only through
// this file.
export { applyMigrations } from './apply-migrations.ts';
export { migrationChecksum, normalizeMigrationText } from './checksum.ts';
export { defaultMigrationsFolder, loadMigrations, type ReadText } from './load-migrations.ts';
export type { MigrationDriver, SqlSession } from './migration-driver.ts';
export type {
  Migration,
  MigrationError,
  MigrationErrorCode,
  MigrationResult,
  MigrationRun,
  MigrationRunOptions,
  MigrationRunResult,
} from './migration-types.ts';
export { pgliteDriver } from './pglite-driver.ts';
export { connectPostgresDriver, type PostgresDriverOptions } from './postgres-driver.ts';
export { defaultMigrationRunOptions, runMigrations } from './run-migrations.ts';
