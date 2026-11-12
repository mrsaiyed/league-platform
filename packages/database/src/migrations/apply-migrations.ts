// Loads the migrations folder and applies it: what local setup, tests and a
// release run.
import { defaultMigrationsFolder, loadMigrations } from './load-migrations.ts';
import type { MigrationDriver } from './migration-driver.ts';
import type { MigrationRunOptions, MigrationRunResult } from './migration-types.ts';
import { runMigrations } from './run-migrations.ts';

/** Applies every pending file in `folder` (default: supabase/migrations). Never throws. */
export async function applyMigrations(
  driver: MigrationDriver,
  folder: string = defaultMigrationsFolder,
  options: MigrationRunOptions = {},
): Promise<MigrationRunResult> {
  const loaded = await loadMigrations(folder);
  if (!loaded.ok) return { ok: false, error: loaded.error, applied: [] };
  return runMigrations(driver, loaded.value, options);
}
