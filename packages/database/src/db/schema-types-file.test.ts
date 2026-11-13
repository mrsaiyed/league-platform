// The checked-in schema-types.ts must be what the migrations produce now. If this
// fails, a migration changed the schema: run `npm run db:types` and check the file in.
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { schemaTypesFile, schemaTypesPath } from './schema-types-file.ts';

describe('schema-types.ts', () => {
  it('matches a fresh generation from the migrations', async () => {
    const checkedIn = await readFile(schemaTypesPath, 'utf8');
    expect(checkedIn.replace(/\r\n/g, '\n')).toBe(await schemaTypesFile());
  });
});
