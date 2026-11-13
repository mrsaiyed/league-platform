// What schema-types.ts should contain now: every migration applied to a fresh PGlite,
// read back by generateSchemaTypes, and formatted as the repository formats code.
// `npm run db:types` writes it; schema-types-file.test.ts checks the file matches.
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { format, resolveConfig } from 'prettier';
import { applyMigrations, defaultMigrationsFolder, pgliteDriver } from '../migrations/index.ts';
import { generateSchemaTypes } from './generate-schema-types.ts';

/** Where the generated types are checked in. */
export const schemaTypesPath = fileURLToPath(new URL('./schema-types.ts', import.meta.url));

/** The formatted text schema-types.ts should have for the migrations in `folder`. */
export async function schemaTypesFile(folder: string = defaultMigrationsFolder): Promise<string> {
  const driver = pgliteDriver(new PGlite());
  try {
    const run = await applyMigrations(driver, folder);
    if (!run.ok) throw new Error(`migrations failed: ${run.error.code}: ${run.error.message}`);
    const text = await generateSchemaTypes(driver);
    const options = await resolveConfig(schemaTypesPath);
    return format(text, { ...options, filepath: schemaTypesPath });
  } finally {
    await driver.close();
  }
}
