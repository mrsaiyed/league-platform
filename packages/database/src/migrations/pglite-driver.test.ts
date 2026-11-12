import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';
import type { MigrationDriver } from './migration-driver.ts';
import { pgliteDriver } from './pglite-driver.ts';

let driver: MigrationDriver | undefined;
afterEach(async () => {
  await driver?.close();
  driver = undefined;
});

const open = () => (driver = pgliteDriver(new PGlite()));

describe('pgliteDriver', () => {
  it('runs a query with parameters, and a file of several statements', async () => {
    const db = open();
    await db.exec('create table t (id int, name text);\ninsert into t values (1, $$a$$);');
    const { rows } = await db.query<{ name: string }>('select name from t where id = $1', [1]);
    expect(rows).toEqual([{ name: 'a' }]);
  });

  it('commits a transaction that resolves', async () => {
    const db = open();
    await db.exec('create table t (id int);');
    const result = await db.transaction(async (tx) => {
      await tx.query('insert into t values ($1)', [1]);
      return 'done';
    });
    expect(result).toBe('done');
    expect((await db.query('select * from t')).rows).toHaveLength(1);
  });

  it('rolls back a transaction that throws, and passes the error on', async () => {
    const db = open();
    await db.exec('create table t (id int);');
    await expect(
      db.transaction(async (tx) => {
        await tx.exec('insert into t values (1);');
        throw new Error('stop');
      }),
    ).rejects.toThrow('stop');
    expect((await db.query('select * from t')).rows).toHaveLength(0);
  });
});
