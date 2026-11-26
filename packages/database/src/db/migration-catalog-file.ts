// What migration-catalog.ts should contain now (T-468): every migration applied to a
// fresh PGlite, and read back by the same queries the start-up guard runs (fence-catalog.ts).
// `npm run db:types` writes it beside schema-types.ts; migration-catalog-file.test.ts
// checks the file matches, so the list of what the migrations made cannot fall behind them.
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { format, resolveConfig } from 'prettier';
import { applyMigrations, defaultMigrationsFolder, pgliteDriver } from '../migrations/index.ts';
import { createDatabase } from './create-database.ts';
import { kyselyOf } from './database-handle.ts';
import {
  readDefinerShapes,
  readFencePolicies,
  readLeagueTables,
  readRelations,
  readSchemas,
  type MigrationCatalog,
} from './fence-catalog.ts';
import { reviewedDefiners } from './reviewed-definers.ts';

/** Where the catalog is checked in. */
export const migrationCatalogPath = fileURLToPath(
  new URL('./migration-catalog.ts', import.meta.url),
);

/** What the migrations in `folder` make, read from a fresh database. */
export async function readMigrationCatalog(
  folder: string = defaultMigrationsFolder,
): Promise<MigrationCatalog> {
  const pglite = new PGlite();
  const db = createDatabase({ kind: 'pglite', pglite });
  try {
    const run = await applyMigrations(pgliteDriver(pglite), folder);
    if (!run.ok) throw new Error(`migrations failed: ${run.error.code}: ${run.error.message}`);
    const database = kyselyOf(db);
    const schemas = await readSchemas(database);
    const relations = (await readRelations(database, schemas)).map((relation) => relation.name);
    return {
      schemas,
      relations,
      leagueTables: await readLeagueTables(database),
      policies: await readFencePolicies(database),
      definers: await readDefinerShapes(database, [...reviewedDefiners.keys()]),
    };
  } finally {
    await db.close();
    await pglite.close();
  }
}

/** The formatted text migration-catalog.ts should have for the migrations in `folder`. */
export async function migrationCatalogFile(
  folder: string = defaultMigrationsFolder,
): Promise<string> {
  const catalog = await readMigrationCatalog(folder);
  const text = `// Generated from supabase/migrations by \`npm run db:types\`. Do not edit: a test
// fails when this file differs from a fresh generation (T-468). The start-up guard
// (check-fence.ts) refuses a relation in these schemas that is not listed here, a league
// table listed here that is missing or whose league column is gone or renamed, a policy on
// a league table that is not listed here word for word, and a reviewed definer function
// whose body, settings, owner, language or security differ from what is listed here.
import type { MigrationCatalog } from './fence-catalog.ts';

export const migrationCatalog: MigrationCatalog = ${JSON.stringify(catalog)};
`;
  const options = await resolveConfig(migrationCatalogPath);
  return format(text, { ...options, filepath: migrationCatalogPath });
}
