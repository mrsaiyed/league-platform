// What the start-up guard (step 2.238) reads from the catalog about each league's fence,
// in the same queries for the migrations' own database (migration-catalog-file.ts, which
// writes migration-catalog.ts) and for the database the app starts on (check-fence.ts),
// so the two are compared word for word.
//
// A league table is one with a `league_id` column, or the table such a column points at
// (the leagues themselves), in any schema but the server's own (T-470), and, at start, every
// table the migrations' catalog lists as one, whatever columns it has now (T-470, changed):
// a league column renamed by hand must not hide its table.
import { createHash } from 'node:crypto';
import { sql, type Kysely, type RawBuilder } from 'kysely';
import type { Database } from './schema-types.ts';

/** One policy on a league table, as the catalog states it. */
export type FencePolicy = {
  /** The table, `schema.table`, each part quoted as PostgreSQL would need. */
  readonly table: string;
  readonly name: string;
  readonly permissive: boolean;
  /** all, select, insert, update or delete. */
  readonly command: string;
  /** The roles it applies to, sorted, `public` for every role. */
  readonly roles: string;
  readonly using: string | null;
  readonly check: string | null;
};

/** A league table the migrations made, with the column that says each row's league. */
export type LeagueTable = {
  /** `schema.table`, each part quoted as PostgreSQL would need. */
  readonly table: string;
  /** `league_id`, or for the leagues themselves the column league columns point at. */
  readonly column: string;
  /** Its place among the table's columns (pg_attribute.attnum), to see a rename. */
  readonly place: number;
};

/** A reviewed security-definer function as the migrations leave it (T-477). */
export type DefinerShape = {
  /** `schema.name(arguments)`, as reviewed-definers.ts keys it. */
  readonly signature: string;
  /** sha256 of its body (prosrc, and a SQL-standard body if it has one). */
  readonly body: string;
  /** Its settings (proconfig), such as `search_path=""`, as stored. */
  readonly settings: readonly string[];
  readonly owner: string;
  readonly language: string;
  readonly securityDefiner: boolean;
};

/** What the migrations made: their schemas, every relation in them, the fence's policies. */
export type MigrationCatalog = {
  readonly schemas: readonly string[];
  /** `schema.name` of every table, view and foreign table in those schemas. */
  readonly relations: readonly string[];
  readonly leagueTables: readonly LeagueTable[];
  readonly policies: readonly FencePolicy[];
  readonly definers: readonly DefinerShape[];
};

/**
 * Every league table: its oid, name and whether its row-level security is on and forced.
 * Found by its league column, and, whatever its columns now, each of `listed`.
 */
export const leagueTables = (listed: readonly string[]): RawBuilder<unknown> => sql`
  select c.oid, pg_catalog.quote_ident(n.nspname) || '.' || pg_catalog.quote_ident(c.relname)
      as table_name,
    c.relrowsecurity as enabled, c.relforcerowsecurity as forced
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p')
    and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
    and (exists (
        select 1 from pg_catalog.pg_attribute a
        where a.attrelid = c.oid and a.attname = 'league_id' and a.attnum > 0
          and not a.attisdropped)
      or exists (
        select 1 from pg_catalog.pg_constraint k
        join pg_catalog.pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
        where k.contype = 'f' and k.confrelid = c.oid and a.attname = 'league_id')
      or pg_catalog.quote_ident(n.nspname) || '.' || pg_catalog.quote_ident(c.relname) in (
        select pg_catalog.jsonb_array_elements_text(${JSON.stringify(listed)}::jsonb)))`;

/** Every league table found by its league column, with that column (for the catalog). */
export async function readLeagueTables(database: Kysely<Database>): Promise<LeagueTable[]> {
  const { rows } = await sql<LeagueTable>`
    with league_tables as (${leagueTables([])})
    select distinct on (t.table_name) t.table_name as "table", a.attname::text as "column",
      a.attnum::int as place
    from league_tables t
    join pg_catalog.pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
    where a.attname = 'league_id'
      or a.attnum in (
        select pg_catalog.unnest(k.confkey) from pg_catalog.pg_constraint k
        join pg_catalog.pg_attribute f on f.attrelid = k.conrelid and f.attnum = any (k.conkey)
        where k.contype = 'f' and k.confrelid = t.oid and f.attname = 'league_id')
    order by t.table_name, a.attname <> 'league_id'`.execute(database);
  return rows;
}

/**
 * The shape of each function in `signatures` that exists (T-477): the same on PostgreSQL 16
 * and 17, since each part is stored as written, not printed back.
 */
export async function readDefinerShapes(
  database: Kysely<Database>,
  signatures: readonly string[],
): Promise<DefinerShape[]> {
  const { rows } = await sql<{
    signature: string;
    source: string;
    standard: string | null;
    settings: string[];
    owner: string;
    language: string;
    security_definer: boolean;
  }>`
    select * from (
      select pg_catalog.quote_ident(n.nspname) || '.' || pg_catalog.quote_ident(p.proname) ||
          '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' as signature,
        p.prosrc as source,
        case when p.prosqlbody is null then null
          else pg_catalog.pg_get_function_sqlbody(p.oid) end as standard,
        coalesce(p.proconfig, array[]::text[]) as settings,
        pg_catalog.pg_get_userbyid(p.proowner)::text as owner, l.lanname::text as language,
        p.prosecdef as security_definer
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      join pg_catalog.pg_language l on l.oid = p.prolang
    ) functions
    where signature in (
      select pg_catalog.jsonb_array_elements_text(${JSON.stringify(signatures)}::jsonb))
    order by signature`.execute(database);
  return rows.map((row) => ({
    signature: row.signature,
    body: createHash('sha256')
      .update(row.standard === null ? row.source : `${row.source}\0${row.standard}`)
      .digest('hex'),
    settings: row.settings,
    owner: row.owner,
    language: row.language,
    securityDefiner: row.security_definer,
  }));
}

/** The schemas that are not the server's own. */
export async function readSchemas(database: Kysely<Database>): Promise<string[]> {
  const { rows } = await sql<{ name: string }>`
    select n.nspname::text as name from pg_catalog.pg_namespace n
    where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
    order by 1`.execute(database);
  return rows.map((row) => row.name);
}

/** Every table, view and foreign table in `schemas`, with its kind (pg_class.relkind). */
export async function readRelations(
  database: Kysely<Database>,
  schemas: readonly string[],
): Promise<{ name: string; kind: string }[]> {
  const { rows } = await sql<{ name: string; kind: string }>`
    select pg_catalog.quote_ident(n.nspname) || '.' || pg_catalog.quote_ident(c.relname) as name,
      c.relkind::text as kind
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p', 'v', 'm', 'f')
      and n.nspname::text in (
        select pg_catalog.jsonb_array_elements_text(${JSON.stringify(schemas)}::jsonb))
    order by 1`.execute(database);
  return rows;
}

/** Every policy on a league table (found, or one of `listed`). */
export async function readFencePolicies(
  database: Kysely<Database>,
  listed: readonly string[] = [],
): Promise<FencePolicy[]> {
  const { rows } = await sql<FencePolicy>`
    with league_tables as (${leagueTables(listed)})
    select t.table_name as "table", p.polname::text as name, p.polpermissive as permissive,
      case p.polcmd when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update'
        when 'd' then 'delete' else 'all' end as command,
      coalesce((
        select pg_catalog.string_agg(named.role, ', ' order by named.role)
        from (
          select case when r.oid = 0 then 'public' else pg_catalog.pg_get_userbyid(r.oid)::text
            end as role
          from pg_catalog.unnest(p.polroles) as r(oid)
        ) named), '') as roles,
      pg_catalog.pg_get_expr(p.polqual, p.polrelid) as "using",
      pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) as "check"
    from pg_catalog.pg_policy p
    join league_tables t on t.oid = p.polrelid
    order by 1, 2`.execute(database);
  return rows.map((row) => ({ ...row, using: rule(row.using), check: rule(row.check) }));
}

/**
 * A policy's rule as compared: the catalog writes `public.` before a name only when the
 * reading session's search path lacks it, so that, and spacing, do not count.
 */
export function rule(text: string | null): string | null {
  return text === null
    ? null
    : text
        .replace(/\bpublic\./g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
