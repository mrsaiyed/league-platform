// The pg driver against real PostgreSQL over the network: PGlite behind a local
// socket, the same way a hosted database is reached.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterEach, describe, expect, it } from 'vitest';
import { applyMigrations } from './apply-migrations.ts';
import { connectPostgresDriver, sslSetting } from './postgres-driver.ts';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0).reverse()) await step();
});

async function serverAddress(db: PGlite): Promise<string> {
  const server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  await server.start();
  cleanup.push(() => server.stop());
  return `postgres://postgres:postgres@${server.getServerConn()}/postgres`;
}

describe('connectPostgresDriver', () => {
  it('applies the repository migrations, and a second run is a no-op', async () => {
    const db = new PGlite();
    cleanup.push(() => db.close());
    const driver = await connectPostgresDriver(await serverAddress(db), { ssl: 'off' });
    cleanup.push(() => driver.close());

    const first = await applyMigrations(driver);
    expect(first.ok && first.value.applied).toContain('0001_migration_log.sql');
    const second = await applyMigrations(driver);
    expect(second.ok && second.value.applied).toEqual([]);

    const { rows } = await driver.query<{ name: string }>(
      'select name from migration_log.applied order by version',
    );
    expect(rows.map((r) => r.name)).toEqual(first.ok ? first.value.applied : []);
  });

  it('rolls a failing file back whole', async () => {
    const db = new PGlite();
    cleanup.push(() => db.close());
    const driver = await connectPostgresDriver(await serverAddress(db), { ssl: 'off' });
    cleanup.push(() => driver.close());
    const folder = await mkdtemp(path.join(os.tmpdir(), 'migrations-'));
    cleanup.push(() => rm(folder, { recursive: true, force: true }));
    await writeFile(
      path.join(folder, '0001_broken.sql'),
      'create table seasons (id integer);\nselect missing_function();\n',
    );

    const run = await applyMigrations(driver, folder);
    expect(!run.ok && run.error.code).toBe('migration_failed');
    const { rows } = await driver.query<{ found: string | null }>(
      "select to_regclass('seasons')::text as found",
    );
    expect(rows[0]?.found).toBeNull();
  });

  it('survives a dropped connection and fails later calls instead', async () => {
    const db = new PGlite();
    cleanup.push(() => db.close());
    const server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
    await server.start();
    const address = `postgres://postgres:postgres@${server.getServerConn()}/postgres`;
    const driver = await connectPostgresDriver(address, { ssl: 'off' });
    cleanup.push(() => driver.close().catch(() => {}));
    await driver.query('select 1');

    await server.stop();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expect(driver.query('select 1')).rejects.toThrow();
  });
});

describe('sslSetting', () => {
  it('checks the certificate unless told not to', () => {
    expect(sslSetting({})).toEqual({ rejectUnauthorized: true });
    expect(sslSetting({ ssl: 'verify' })).toEqual({ rejectUnauthorized: true });
    expect(sslSetting({ ca: 'PEM' })).toEqual({ rejectUnauthorized: true, ca: 'PEM' });
    expect(sslSetting({ ssl: 'no-verify' })).toEqual({ rejectUnauthorized: false });
    expect(sslSetting({ ssl: 'off' })).toBe(false);
  });
});
