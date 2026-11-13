// PGlite has one connection: callers take turns, and a connection whose turn has
// ended refuses queries.
import { PGlite } from '@electric-sql/pglite';
import { Kysely, sql, type Generated } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pgliteDialect } from './pglite-dialect.ts';

type Rows = { steps: { id: Generated<number>; label: string } };

let pglite: PGlite;
let kysely: Kysely<Rows>;
beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec('create table steps (id serial primary key, label text not null)');
  kysely = new Kysely<Rows>({ dialect: pgliteDialect(pglite) });
});
afterAll(async () => {
  await kysely.destroy();
  await pglite.close();
});

describe('pgliteDialect', () => {
  it('runs one transaction at a time: the second waits for the first to commit', async () => {
    const order: string[] = [];
    let letFirstFinish = () => {};
    const gate = new Promise<void>((resolve) => {
      letFirstFinish = resolve;
    });
    let firstStarted = () => {};
    const started = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });

    const first = kysely.transaction().execute(async (trx) => {
      order.push('first begins');
      firstStarted();
      await gate;
      await trx.insertInto('steps').values({ label: 'first' }).execute();
      order.push('first ends');
    });
    await started;
    const second = kysely.transaction().execute(async (trx) => {
      order.push('second begins');
      return trx.selectFrom('steps').select('label').execute();
    });
    // Give the second every chance to start early, then let the first go.
    await new Promise((resolve) => setTimeout(resolve, 20));
    letFirstFinish();
    const [, seen] = await Promise.all([first, second]);

    expect(order).toEqual(['first begins', 'first ends', 'second begins']);
    expect(seen).toEqual([{ label: 'first' }]);
  });

  it('refuses a query on a connection whose turn has ended', async () => {
    const kept = await kysely.connection().execute(async (connection) => connection);
    await expect(sql`select 1`.execute(kept)).rejects.toThrow('no longer holds its turn');
  });

  it('reads a date as its text', async () => {
    const { rows } = await sql<{ day: string }>`select date '2026-03-01' as day`.execute(kysely);
    expect(rows).toEqual([{ day: '2026-03-01' }]);
  });
});
