// How each kind of column becomes a type, and that a type with no decided mapping
// stops the generation.
import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';
import { pgliteDriver } from '../migrations/index.ts';
import { generateSchemaTypes } from './generate-schema-types.ts';

let db: PGlite | undefined;
afterEach(async () => {
  await db?.close();
  db = undefined;
});

async function typesFor(ddl: string) {
  db = new PGlite();
  await db.exec(ddl);
  return generateSchemaTypes(pgliteDriver(db));
}

describe('generateSchemaTypes', () => {
  it('maps nullability, defaults, generated columns, arrays and jsonb', async () => {
    const text = await typesFor(`
      create table public.sample_rows (
        id uuid primary key default gen_random_uuid(),
        title text not null,
        note text,
        tags text[] not null default '{}',
        doc jsonb,
        happened_at timestamptz not null,
        loud_title text generated always as (upper(title)) stored
      );
      create view public.sample_view as select id from public.sample_rows;
    `);
    expect(text).toContain(`export interface SampleRowsTable {
  id: Generated<string>;
  title: string;
  note: string | null;
  tags: ColumnType<(string | null)[], string[] | undefined, string[]>;
  doc: ColumnType<JsonValue | null, JsonObject | null, JsonObject | null>;
  happened_at: ColumnType<Date, Date | string, Date | string>;
  loud_title: GeneratedAlways<string | null>;
}`);
    expect(text).toContain('  sample_rows: SampleRowsTable;');
    expect(text).not.toContain('sample_view');
  });

  it('types the sign-in store’s schema as a database of its own, named with its schema', async () => {
    const text = await typesFor(`
      create table public.plain_rows (id uuid primary key);
      create schema sign_in;
      create table sign_in.sessions (session_id text primary key, ended boolean not null);
    `);
    expect(text).toContain(`export interface SignInSessionsTable {
  session_id: string;
  ended: boolean;
}`);
    expect(text).toContain(`export interface SignInDatabase {
  'sign_in.sessions': SignInSessionsTable;
}`);
    expect(text).toContain('  plain_rows: PlainRowsTable;');
    // Without the schema there is no SignInDatabase at all.
    await db?.close();
    expect(await typesFor('create table public.only_rows (id uuid primary key);')).not.toContain(
      'SignInDatabase',
    );
  });

  it('refuses an array whose elements the drivers would not parse as promised', async () => {
    await expect(typesFor('create table public.days (d date[]);')).rejects.toThrow(
      'days.d: arrays of date are not supported',
    );
  });

  it('refuses two tables that would get the same type name', async () => {
    await expect(
      typesFor('create table public.ab_c (id int); create table public."abC" (id int);'),
    ).rejects.toThrow('would both be typed AbCTable');
  });

  it('refuses a type with no decided mapping', async () => {
    await expect(typesFor('create table public.counts (n bigint not null);')).rejects.toThrow(
      'counts.n: no TypeScript type for PostgreSQL type int8',
    );
  });
});
