// Writes the TypeScript description of the schema (T1 §1: the code cannot ask for a
// column that does not exist), read from a database the migrations were applied to.
// The migrations stay the source of truth; this only reads them back.
//
// Every PostgreSQL type used must be in `columnTypes`. A new one fails the
// generation until someone decides how it is read and written in both dialects
// (bigint, for one, is a number in PGlite and text in pg).
//
// Arrays: PostgreSQL cannot declare an array's elements NOT NULL, so an element is
// read as possibly null. Only arrays of the types in `arrayElements` are allowed:
// the drivers do not parse elements of the others (date, timestamptz, jsonb) the
// way the column types promise.
import type { SqlSession } from '../migrations/index.ts';

type Column = {
  table_name: string;
  column_name: string;
  udt_name: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
  is_generated: 'ALWAYS' | 'NEVER';
  identity_generation: 'ALWAYS' | 'BY DEFAULT' | null;
};

/** How each PostgreSQL type is read (select) and written (insert and update). */
const columnTypes: Record<string, { read: string; write: string }> = {
  uuid: { read: 'string', write: 'string' },
  text: { read: 'string', write: 'string' },
  bool: { read: 'boolean', write: 'boolean' },
  int2: { read: 'number', write: 'number' },
  int4: { read: 'number', write: 'number' },
  date: { read: 'string', write: 'string' },
  timestamptz: { read: 'Date', write: 'Date | string' },
  jsonb: { read: 'JsonValue', write: 'JsonObject' },
};

/** Element types an array column may have. */
const arrayElements = new Set(['uuid', 'text', 'bool', 'int2', 'int4']);

const header = `// Generated from supabase/migrations by \`npm run db:types\`. Do not edit: a test
// fails when this file differs from a fresh generation.
import type { ColumnType, Generated, GeneratedAlways } from 'kysely';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
/** jsonb is written as an object: both dialects send an object as JSON, but pg sends an array as a PostgreSQL array. */
export type JsonObject = { [key: string]: JsonValue };
`;

function typeOf(column: Column): string {
  const where = `${column.table_name}.${column.column_name}`;
  const array = column.udt_name.startsWith('_');
  const element = array ? column.udt_name.slice(1) : column.udt_name;
  const base = columnTypes[element];
  if (base === undefined) {
    throw new Error(
      `${where}: no TypeScript type for PostgreSQL type ${column.udt_name}. ` +
        'Add it to columnTypes in generate-schema-types.ts.',
    );
  }
  if (array && !arrayElements.has(element)) {
    throw new Error(`${where}: arrays of ${element} are not supported. Use another shape.`);
  }
  const nullable = column.is_nullable === 'YES' ? ' | null' : '';
  const read = (array ? `(${base.read} | null)[]` : base.read) + nullable;
  const write = (array ? `${base.write}[]` : base.write) + nullable;
  if (column.is_generated === 'ALWAYS' || column.identity_generation === 'ALWAYS') {
    return `GeneratedAlways<${read}>`;
  }
  const defaulted = column.column_default !== null || column.identity_generation !== null;
  if (read === write) return defaulted ? `Generated<${read}>` : read;
  return defaulted
    ? `ColumnType<${read}, ${write} | undefined, ${write}>`
    : `ColumnType<${read}, ${write}, ${write}>`;
}

const pascal = (name: string) =>
  name.replace(/(^|_)([a-z0-9])/g, (_, __: string, letter: string) => letter.toUpperCase());

/** The text of schema-types.ts for the `public` tables of `db`, before formatting. */
export async function generateSchemaTypes(db: SqlSession): Promise<string> {
  const { rows } = await db.query<Column>(
    `select c.table_name, c.column_name, c.udt_name, c.is_nullable, c.column_default,
            c.is_generated, c.identity_generation
     from information_schema.columns c
     join information_schema.tables t
       on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
     order by c.table_name, c.ordinal_position`,
  );
  const tables = new Map<string, Column[]>();
  for (const row of rows) tables.set(row.table_name, [...(tables.get(row.table_name) ?? []), row]);

  const names = new Map<string, string>();
  for (const table of tables.keys()) {
    const taken = names.get(pascal(table));
    if (taken !== undefined) {
      throw new Error(`Tables ${taken} and ${table} would both be typed ${pascal(table)}Table.`);
    }
    names.set(pascal(table), table);
  }

  const parts = [header];
  for (const [table, columns] of tables) {
    const fields = columns.map((column) => `  ${column.column_name}: ${typeOf(column)};`);
    parts.push(`export interface ${pascal(table)}Table {\n${fields.join('\n')}\n}\n`);
  }
  const entries = [...tables.keys()].map((table) => `  ${table}: ${pascal(table)}Table;`);
  parts.push(`/** Every table in the public schema, for Kysely. */
export interface Database {\n${entries.join('\n')}\n}\n`);
  return parts.join('\n');
}
