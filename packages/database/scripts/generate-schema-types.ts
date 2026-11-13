// `npm run db:types`: rewrites packages/database/src/db/schema-types.ts from the
// migrations. Run it after adding a migration, and check the result in.
import { writeFile } from 'node:fs/promises';
import { schemaTypesFile, schemaTypesPath } from '../src/db/schema-types-file.ts';

await writeFile(schemaTypesPath, await schemaTypesFile());
console.log(`Wrote ${schemaTypesPath}`);
