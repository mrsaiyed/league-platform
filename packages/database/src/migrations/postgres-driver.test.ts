// The pg driver against real PostgreSQL over the network: PGlite behind a local
// socket, the same way a hosted database is reached.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import { applyMigrations } from './apply-migrations.ts';
import {
  connectPostgresDriver,
  sslAddressKeys,
  sslSetting,
  withoutSslKeys,
} from './postgres-driver.ts';

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

describe('the address cannot change how the connection is encrypted', () => {
  it('takes no SSL setting from the address: with verify it still asks for SSL', async () => {
    // PGlite's server speaks no SSL. Asked for SSL, the connection is refused; if
    // the address could turn SSL off (ssl=0) or the check off (ssl=no-verify), or turn
    // it on (ssl=true) where it was off, the outcome would follow the address instead.
    // Each refused try gets a server of its own: one that refused SSL may drop the next.
    for (const query of ['ssl=0', 'ssl=false', 'ssl=no-verify', 'SSL=0', 'sslmode=disable']) {
      const db = new PGlite();
      cleanup.push(() => db.close());
      const address = await serverAddress(db);
      await expect(
        connectPostgresDriver(`${address}?${query}`, { ssl: 'verify', ca: 'made-up' }),
        query,
      ).rejects.toThrow();
    }
    const db = new PGlite();
    cleanup.push(() => db.close());
    const address = await serverAddress(db);
    for (const query of ['ssl=true', 'ssl=1', 'sslnegotiation=direct', 'sslmode=require']) {
      const driver = await connectPostgresDriver(`${address}?${query}`, { ssl: 'off' });
      try {
        const { rows } = await driver.query<{ one: number }>('select 1 as one');
        expect(rows, query).toEqual([{ one: 1 }]);
      } finally {
        // The server takes one connection at a time.
        await driver.close();
      }
    }
  });

  it('keeps the given certificate whatever the address says', () => {
    const ca = '-----BEGIN CERTIFICATE-----made-up-----END CERTIFICATE-----';
    const base = 'postgres://made-up:made-up@db.example.test:5432/league';
    for (const query of [
      'ssl=true',
      'ssl=1',
      'ssl=no-verify',
      'sslnegotiation=direct',
      'sslmode=no-verify',
      'uselibpqcompat=true&sslmode=require',
    ]) {
      const client = new pg.Client({
        connectionString: withoutSslKeys(`${base}?${query}&application_name=web`),
        ssl: sslSetting({ ssl: 'verify', ca }),
      });
      const parameters = (client as unknown as { connectionParameters: { ssl: unknown } })
        .connectionParameters;
      expect(parameters.ssl, query).toEqual({ rejectUnauthorized: true, ca });
    }
  });

  it('strips every key the parser reads for SSL, in any capitals, and keeps the rest', () => {
    expect(sslAddressKeys).toEqual([
      'ssl',
      'sslmode',
      'sslcert',
      'sslkey',
      'sslrootcert',
      'sslnegotiation',
      'uselibpqcompat',
    ]);
    expect(
      withoutSslKeys(
        'postgres://u:p@db.example.test/league?SSL=0&sslNegotiation=direct&sslrootcert=x&application_name=web',
      ),
    ).toBe('postgres://u:p@db.example.test/league?application_name=web');
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
