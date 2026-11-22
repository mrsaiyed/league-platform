// T-86: no personal content in logs. The people table holds a person's names, contact
// email, date of birth, whether they are a child and what they asked to be shown as; a
// log line that carried any of them under its own column name, in any casing
// (birth_date, birthDate, BirthDate, birth-date, BIRTH_DATE), must have it masked by the
// log's redaction (packages/observability, redact.ts). The column list is read from the
// migrated schema itself, so a column added to people later is masked too or this test
// fails (step 2.50; the 2.108 audit, finding D-L4). Only ids, times and the version, named
// below, are left readable: a log line is found by its ids.
import { redact } from '@srleagues/observability';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshSchema } from './schema.test-helper.ts';

/** The people columns a log may show: ids, times and the version, none of them personal. */
const bookkeeping = [
  'id',
  'league_id',
  'profile_id',
  'merged_into_id',
  'deleted_at',
  'version',
  'created_at',
  'updated_at',
];

/** A column name in every casing a line of code might give it. */
function casings(column: string): string[] {
  const parts = column.split('_');
  const camel = parts
    .map((part, i) => (i === 0 ? part : part[0]?.toUpperCase() + part.slice(1)))
    .join('');
  return [
    column,
    camel,
    camel[0]?.toUpperCase() + camel.slice(1),
    parts.join('-'),
    column.toUpperCase(),
  ];
}

let db: PGlite;
let columns: string[];
beforeAll(async () => {
  db = await freshSchema();
  const { rows } = await db.query<{ column_name: string }>(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'people' order by ordinal_position`,
  );
  columns = rows.map((row) => row.column_name);
}, 120_000);
afterAll(async () => {
  await db.close();
});

describe("the people table's columns in a log line (T-86)", () => {
  it('are read from the schema, and the readable ones are all still there', () => {
    expect(columns.length).toBeGreaterThan(bookkeeping.length);
    for (const column of bookkeeping) expect(columns, column).toContain(column);
  });

  it('are masked in every casing, all but the ids, times and version', () => {
    const personal = columns.filter((column) => !bookkeeping.includes(column));
    expect(personal).toContain('birth_date');
    for (const column of personal) {
      for (const key of casings(column)) {
        const out = redact({ [key]: 'Quinn 2012-09-03' }) as Record<string, unknown>;
        expect(out[key], `${key} (the people column ${column})`).toBe('[redacted]');
      }
    }
  });

  it('a date of birth is masked under the names code gives it, too', () => {
    const out = redact({ dateOfBirth: '2012-09-03', dob: '2012-09-03' }) as Record<string, unknown>;
    expect(out).toEqual({ dateOfBirth: '[redacted]', dob: '[redacted]' });
  });
});
