// What the start-up guard (step 2.238) reads from the catalog about each league's fence,
// in the same queries for the migrations' own database (migration-catalog-file.ts, which
// writes migration-catalog.ts) and for the database the app starts on (check-fence.ts),
// so the two are compared word for word.
//
// A league table is one with a `league_id` column, or the table such a column points at
// (the leagues themselves), in any schema but the server's own (T-470).
import { sql, type Kysely } from 'kysely';
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

/** What the migrations made: their schemas, every relation in them, the fence's policies. */
export type MigrationCatalog = {
  readonly schemas: readonly string[];
  /** `schema.name` of every table, view and foreign table in those schemas. */
  readonly relations: readonly string[];
  readonly policies: readonly FencePolicy[];
};

/** Every league table: its oid, name and whether its row-level security is on and forced. */
export const leagueTables = sql`
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
        where k.contype = 'f' and k.confrelid = c.oid and a.attname = 'league_id'))`;

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

/** Every policy on a league table. */
export async function readFencePolicies(database: Kysely<Database>): Promise<FencePolicy[]> {
  const { rows } = await sql<FencePolicy>`
    with league_tables as (${leagueTables})
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
