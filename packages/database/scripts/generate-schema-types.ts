// `npm run db:types`: rewrites packages/database/src/db/schema-types.ts and
// migration-catalog.ts (T-468) from the migrations. Run it after adding a migration, and
// check the results in.
import { writeFile } from 'node:fs/promises';
import { migrationCatalogFile, migrationCatalogPath } from '../src/db/migration-catalog-file.ts';
import { schemaTypesFile, schemaTypesPath } from '../src/db/schema-types-file.ts';

await writeFile(schemaTypesPath, await schemaTypesFile());
console.log(`Wrote ${schemaTypesPath}`);
await writeFile(migrationCatalogPath, await migrationCatalogFile());
console.log(`Wrote ${migrationCatalogPath}`);
