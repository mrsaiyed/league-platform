// The migration log against this code's migrations folder, on PGlite only (T-201).
// The cases the tool refuses with (none, behind, ahead) are in make-league.test.ts.
import path from 'node:path';
import { tmpdir } from 'node:os';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pgliteDriver } from '../migrations/index.ts';
import { freshSchema } from '../schema/schema.test-helper.ts';
import { migrationState } from './migration-state.ts';

let pglite: PGlite;
beforeAll(async () => {
  pglite = await freshSchema();
});
afterAll(async () => {
  await pglite.close();
});

describe('migrationState', () => {
  it('is ready when every file of this code is applied, unchanged', async () => {
    expect(await migrationState(pgliteDriver(pglite))).toBe('ready');
  });

  it('says so when this code cannot read its own migrations folder', async () => {
    const missing = path.join(tmpdir(), 'no-such-migrations-folder-for-this-test');
    expect(await migrationState(pgliteDriver(pglite), missing)).toBe('code-unreadable');
  });

  it('says a file applied there differs from this code’s file of the same number', async () => {
    const other = await freshSchema();
    try {
      await other.exec(
        "update migration_log.applied set checksum = repeat('a', 64) where version = 2",
      );
      expect(await migrationState(pgliteDriver(other))).toBe('different');
    } finally {
      await other.close();
    }
  });
});
