// T-468: the checked-in migration-catalog.ts must be what the migrations make now. If this
// fails, a migration changed the schema: run `npm run db:types` and check the files in.
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { migrationCatalogFile, migrationCatalogPath } from './migration-catalog-file.ts';

describe('migration-catalog.ts', () => {
  it('matches a fresh generation from the migrations', async () => {
    const checkedIn = await readFile(migrationCatalogPath, 'utf8');
    expect(checkedIn.replace(/\r\n/g, '\n')).toBe(await migrationCatalogFile());
  });
});
