import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';
import { applyMigrations } from './apply-migrations.ts';
import type { MigrationDriver } from './migration-driver.ts';
import { pgliteDriver } from './pglite-driver.ts';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0).reverse()) await step();
});

async function setup(files: Record<string, string>): Promise<[MigrationDriver, string]> {
  const driver = pgliteDriver(new PGlite());
  cleanup.push(() => driver.close());
  const folder = await mkdtemp(path.join(os.tmpdir(), 'migrations-'));
  cleanup.push(() => rm(folder, { recursive: true, force: true }));
  for (const [name, text] of Object.entries(files)) await writeFile(path.join(folder, name), text);
  return [driver, folder];
}

describe('applyMigrations', () => {
  it('loads the folder and applies it', async () => {
    const [driver, folder] = await setup({ '0001_t.sql': 'create table t (id int);\n' });
    expect(await applyMigrations(driver, folder)).toEqual({
      ok: true,
      value: { applied: ['0001_t.sql'], alreadyApplied: [], newerInDatabase: [] },
    });
  });

  it('passes a loading problem on without touching the database', async () => {
    const [driver, folder] = await setup({ '0001_t.sql': 'begin;\ncreate table t (id int);\n' });
    const run = await applyMigrations(driver, folder);
    expect(run).toMatchObject({ ok: false, error: { code: 'transaction_control' }, applied: [] });
    const { rows } = await driver.query<{ found: string | null }>(
      "select to_regclass('migration_log.applied')::text as found",
    );
    expect(rows[0]?.found).toBeNull();
  });

  it('passes the options on', async () => {
    const [driver, folder] = await setup({ '0001_t.sql': 'create table t (id int);\n' });
    const run = await applyMigrations(driver, folder, { lockWaitMs: -5 });
    expect(!run.ok && run.error.code).toBe('invalid_options');
  });
});
