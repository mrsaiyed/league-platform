// Whether a database is at the same migrations as this copy of the code, before the
// tool that makes a league (step 2.125, record 057) reads or writes anything else: the
// database's migration log (T-48) against the repository's migrations folder. A
// database the runner never touched, one behind this code and one ahead of it are
// each refused in plain words by the tool, never met with a raw error from a missing
// table or column.
import { defaultMigrationsFolder, loadMigrations, type SqlSession } from '../migrations/index.ts';
import { appliedMigrations } from './login-queries.ts';

export type MigrationState =
  /** Every file in the folder is applied, unchanged, and nothing newer. */
  | 'ready'
  /** No migration was ever applied there. */
  | 'none'
  /** Files of this code are not applied there yet: apply the migrations first. */
  | 'behind'
  /** It holds migrations newer than this code: it was set up by a later version. */
  | 'ahead'
  /** A file applied there differs from this code's file of the same number. */
  | 'different'
  /** This copy's migrations folder cannot be read or is not in order. */
  | 'code-unreadable';

export async function migrationState(
  session: SqlSession,
  folder: string = defaultMigrationsFolder,
): Promise<MigrationState> {
  const code = await loadMigrations(folder);
  if (!code.ok) return 'code-unreadable';
  const applied = await appliedMigrations(session);
  if (applied === undefined || applied.length === 0) return 'none';
  const newest = code.value.at(-1)?.version ?? 0;
  if (applied.some((row) => row.version > newest)) return 'ahead';
  const byVersion = new Map(applied.map((row) => [row.version, row]));
  let behind = false;
  for (const file of code.value) {
    const row = byVersion.get(file.version);
    if (row === undefined) behind = true;
    else if (row.name !== file.name || row.checksum !== file.checksum) return 'different';
  }
  return behind ? 'behind' : 'ready';
}
