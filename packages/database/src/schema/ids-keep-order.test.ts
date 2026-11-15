// Step 2.151 (migration 0019, record 068, T-272; T3 §1, T-41): on one connection every
// id public.uuid_v7() makes sorts after every id it made before, on PGlite too, whose
// clock moves in whole milliseconds. Nothing is promised across connections.
//
// PGlite runs one database session, so a second connection here is a second PGlite:
// what it shows is that each connection's memory is its own. On the hosted database a
// session setting belongs to its connection by PostgreSQL's own design.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshSchema, one } from './schema.test-helper.ts';

const migrations = fileURLToPath(new URL('../../../../supabase/migrations/', import.meta.url));
const migrationText = () => {
  const file = readdirSync(migrations).find((name) => name.endsWith('_ids_keep_their_order.sql'));
  if (file === undefined) throw new Error('the migration that keeps ids in order is missing');
  return readFileSync(path.join(migrations, file), 'utf8');
};

let db: PGlite;
let second: PGlite;
beforeAll(async () => {
  [db, second] = await Promise.all([freshSchema(), freshSchema()]);
  for (const connection of [db, second]) {
    await connection.exec(
      'create temporary table made (n integer not null, id uuid not null default public.uuid_v7())',
    );
  }
});
afterAll(async () => {
  await Promise.all([db.close(), second.close()]);
});

/** The ids in the order they were made (by n), and the same ids as the database sorts them. */
async function madeAndSorted(connection: PGlite, where = 'true') {
  const made = await connection.query<{ id: string }>(
    `select id::text from made where ${where} order by n`,
  );
  const sorted = await connection.query<{ id: string }>(
    `select id::text from made where ${where} order by id`,
  );
  return { made: made.rows.map((r) => r.id), sorted: sorted.rows.map((r) => r.id) };
}

/** The 60-bit time part of an id: milliseconds times 4,096 plus the 12 bits after the version. */
const timePart = (id: string) => {
  const hex = id.replaceAll('-', '');
  return BigInt(`0x${hex.slice(0, 12)}`) * 4096n + BigInt(`0x${hex.slice(13, 16)}`);
};

const clockPart = async (connection: PGlite) =>
  BigInt(
    (
      await one<{ stamp: string }>(
        connection,
        `select floor(extract(epoch from clock_timestamp()) * 4096000)::bigint::text as stamp`,
      )
    ).stamp,
  );

describe('ids on one connection (T-41, record 068)', () => {
  it('keeps 5,000 ids made in one statement in order', async () => {
    await db.exec('truncate made');
    await db.exec(
      'insert into made (n, id) select n, public.uuid_v7() from generate_series(1, 5000) n',
    );
    const { made, sorted } = await madeAndSorted(db);
    expect(new Set(made).size).toBe(5000);
    expect(sorted).toEqual(made);
    // Text order agrees with the database's uuid order.
    expect([...made].sort()).toEqual(made);
  });

  it('keeps 2,000 ids made by inserts one after another in order', async () => {
    await db.exec('truncate made');
    for (let n = 1; n <= 2000; n++) await db.query('insert into made (n) values ($1)', [n]);
    const { made, sorted } = await madeAndSorted(db);
    expect(made).toHaveLength(2000);
    expect(sorted).toEqual(made);
  });

  it('gives a multi-row insert increasing ids in row order', async () => {
    await db.exec('truncate made');
    await db.exec(
      `insert into made (n) values ${Array.from({ length: 500 }, (_, k) => `(${k + 1})`).join(', ')}`,
    );
    await db.exec('insert into made (n) select n from generate_series(501, 1500) n order by n');
    const { made, sorted } = await madeAndSorted(db);
    expect(made).toHaveLength(1500);
    expect(sorted).toEqual(made);
  });

  it('keeps the layout: version 7, the variant, and the time part is the time', async () => {
    const before = await clockPart(db);
    const { id } = await one<{ id: string }>(db, 'select public.uuid_v7()::text as id');
    const after = await clockPart(db);
    const hex = id.replaceAll('-', '');
    expect(hex[12]).toBe('7');
    expect(Number.parseInt(hex.charAt(16), 16) >> 2).toBe(0b10);
    // Never earlier than the clock, and ahead of it only by the ids just made.
    expect(timePart(id)).toBeGreaterThanOrEqual(before);
    expect(timePart(id)).toBeLessThanOrEqual(after + 4096n);
  });

  it('counts within a millisecond and carries into the next one after 4,096', async () => {
    // As if 4,096 ids had been made in one millisecond a second from now.
    const millis = (await clockPart(db)) / 4096n + 1000n;
    await db.query(`select set_config('srleagues.uuid_v7_last', $1, false)`, [
      String(millis * 4096n + 4095n),
    ]);
    const { id } = await one<{ id: string }>(db, 'select public.uuid_v7()::text as id');
    expect(timePart(id)).toBe((millis + 1n) * 4096n);
    expect(Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16)).toBe(Number(millis + 1n));
  });

  it('stays in order when the clock reads earlier than the last id (the clock stepped back)', async () => {
    const ahead = (await clockPart(db)) + 4096n * 5000n;
    await db.query(`select set_config('srleagues.uuid_v7_last', $1, false)`, [String(ahead)]);
    await db.exec('truncate made');
    for (let n = 1; n <= 50; n++) await db.query('insert into made (n) values ($1)', [n]);
    const { made, sorted } = await madeAndSorted(db);
    expect(sorted).toEqual(made);
    expect(made.every((id) => timePart(id) > ahead)).toBe(true);
  });

  it('after a rollback still sorts after every id of the connection that exists', async () => {
    await db.exec('truncate made');
    await db.query('insert into made (n) values (1)');
    const kept = await one<{ last: string }>(
      db,
      `select current_setting('srleagues.uuid_v7_last') as last`,
    );
    await db.exec('begin');
    await db.exec('insert into made (n) select n from generate_series(2, 100) n');
    await db.exec('rollback');
    // The rollback took its change to the memory with it.
    expect(await one(db, `select current_setting('srleagues.uuid_v7_last') as last`)).toEqual(kept);
    await db.query('insert into made (n) values (101)');
    const { made, sorted } = await madeAndSorted(db);
    expect(made).toHaveLength(2);
    expect(sorted).toEqual(made);
  });

  it('after the connection is reset (RESET ALL) follows the clock again', async () => {
    await db.exec('reset all');
    expect(await one(db, `select current_setting('srleagues.uuid_v7_last', true) as last`)).toEqual(
      { last: '' },
    );
    const before = await clockPart(db);
    const { id } = await one<{ id: string }>(db, 'select public.uuid_v7()::text as id');
    expect(timePart(id)).toBeGreaterThanOrEqual(before);
  });

  it('is volatile and runs without parallel workers (it writes a setting)', async () => {
    expect(
      await one(
        db,
        `select provolatile, proparallel from pg_proc where oid = 'public.uuid_v7()'::regprocedure`,
      ),
    ).toEqual({ provolatile: 'v', proparallel: 'u' });
  });
});

describe('ids on two connections', () => {
  it('keeps each connection its own order when the two are interleaved', async () => {
    await Promise.all([db.exec('truncate made'), second.exec('truncate made')]);
    // The first connection's memory a little ahead of the clock: the second's is its own.
    const ahead = (await clockPart(db)) + 4096n * 5000n;
    await db.query(`select set_config('srleagues.uuid_v7_last', $1, false)`, [String(ahead)]);
    for (let n = 1; n <= 1000; n++) {
      await db.query('insert into made (n) values ($1)', [n]);
      await second.query('insert into made (n) values ($1)', [n]);
    }
    for (const connection of [db, second]) {
      const { made, sorted } = await madeAndSorted(connection);
      expect(made).toHaveLength(1000);
      expect(sorted).toEqual(made);
    }
    // The second connection never saw the first one's memory.
    const firstOfSecond = await one<{ id: string }>(
      second,
      'select id::text from made where n = 1',
    );
    expect(timePart(firstOfSecond.id)).toBeLessThan(ahead);
  });
});

describe('migration 0019 runs twice', () => {
  it('applies again over itself without error, and ids keep their order', async () => {
    await db.exec(migrationText());
    await db.exec(migrationText());
    const { rows } = await db.query<{ table_name: string; column_default: string }>(
      `select table_name, column_default from information_schema.columns
       where table_schema = 'public' and column_name = 'id'`,
    );
    expect(rows.length).toBeGreaterThan(30);
    expect(rows.every((r) => r.column_default === 'uuid_v7()')).toBe(true);
    await db.exec('truncate made');
    await db.exec('insert into made (n) select n from generate_series(1, 1000) n order by n');
    const { made, sorted } = await madeAndSorted(db);
    expect(sorted).toEqual(made);
  });
});
