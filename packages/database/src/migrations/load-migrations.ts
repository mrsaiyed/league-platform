// Reads the numbered SQL files from supabase/migrations (T-48) and checks them
// (validate-migrations.ts). Plain files that are not .sql (a README) are ignored.
// Everything else unexpected fails loudly, so nothing is skipped silently: a .sql
// file with another name, a sub-folder, or a symbolic link (a migration must be a
// reviewed file in this folder, not a pointer to one somewhere else).
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrationChecksum, normalizeMigrationText } from './checksum.ts';
import type { Migration, MigrationError, MigrationResult } from './migration-types.ts';
import { migrationFileName, validateMigrations } from './validate-migrations.ts';

/** The repository's migrations folder. */
export const defaultMigrationsFolder = fileURLToPath(
  new URL('../../../../supabase/migrations/', import.meta.url),
);

/** Reads one file as text. Replaceable in tests. */
export type ReadText = (file: string) => Promise<string>;

const fail = (error: MigrationError): MigrationResult<Migration[]> => ({ ok: false, error });
const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The migrations in `folder`, in order. Never throws: problems come back as errors. */
export async function loadMigrations(
  folder: string = defaultMigrationsFolder,
  read: ReadText = (file) => readFile(file, 'utf8'),
): Promise<MigrationResult<Migration[]>> {
  let entries;
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch (error) {
    return fail({
      code: 'folder_unreadable',
      message: `Cannot read ${folder}: ${reasonOf(error)}`,
    });
  }

  const migrations: Migration[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const isSql = entry.name.toLowerCase().endsWith('.sql');
    if (entry.isSymbolicLink() || entry.isDirectory()) {
      const what = entry.isSymbolicLink() ? 'a symbolic link' : 'a folder';
      return fail({
        code: 'unexpected_entry',
        file: entry.name,
        message: `${entry.name} in ${folder} is ${what}. Migrations are plain files directly in the folder.`,
      });
    }
    if (!isSql || !entry.isFile()) continue;
    const match = migrationFileName.exec(entry.name);
    if (!match) {
      return fail({
        code: 'bad_file_name',
        file: entry.name,
        message: `${entry.name} is not named NNNN_lower_snake_name.sql (for example 0002_leagues.sql).`,
      });
    }
    let text: string;
    try {
      text = await read(path.join(folder, entry.name));
    } catch (error) {
      return fail({
        code: 'file_unreadable',
        file: entry.name,
        message: `Cannot read ${entry.name}: ${reasonOf(error)}`,
      });
    }
    const sql = normalizeMigrationText(text);
    migrations.push({
      version: Number(match[1]),
      name: entry.name,
      sql,
      checksum: migrationChecksum(sql),
    });
  }

  migrations.sort((a, b) => a.version - b.version || a.name.localeCompare(b.name));
  const problem = validateMigrations(migrations);
  return problem ? fail(problem) : { ok: true, value: migrations };
}
