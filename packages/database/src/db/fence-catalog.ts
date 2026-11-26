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

/** A function the migrations made, as they leave it (T-477, widened). */
export type FunctionShape = {
  /** `schema.name(arguments)`, as reviewed-definers.ts keys it. */
  readonly signature: string;
  /** sha256 of its body (prosrc, and a SQL-standard body if it has one). */
  readonly body: string;
  /** Its settings (proconfig), such as `search_path=""`, as stored. */
  readonly settings: readonly string[];
  readonly owner: string;
  readonly language: string;
  readonly securityDefiner: boolean;
  /** i (immutable), s (stable) or v (volatile), as stored (provolatile). */
  readonly volatility: string;
};

/** A table, view, materialized view, foreign table or sequence the migrations made (T-481). */
export type CatalogRelation = {
  /** `schema.name`, each part quoted as PostgreSQL would need. */
  readonly name: string;
  /** pg_class.relkind: r, p, v, m, f or S. */
  readonly kind: string;
  readonly owner: string;
  /** For a view or materialized view, sha256 of its definition and options; else null. */
  readonly definition: string | null;
};

/** A trigger on a relation the migrations made (T-486). */
export type CatalogTrigger = {
  /** The relation, `schema.name`, each part quoted as PostgreSQL would need. */
  readonly table: string;
  /** Its name, quoted as PostgreSQL would need. */
  readonly name: string;
  /** pg_get_triggerdef, read with an empty search path: function, timing, events. */
  readonly definition: string;
  /** pg_trigger.tgenabled: O (as made), D (disabled), R (replica only) or A (always). */
  readonly enabled: string;
};

/** A rewrite rule on a relation the migrations made, other than a view's own (T-486). */
export type CatalogRule = {
  readonly table: string;
  readonly name: string;
  /** sha256 of pg_get_ruledef, read with an empty search path. */
  readonly definition: string;
  /** pg_rewrite.ev_enabled, as a trigger's. */
  readonly enabled: string;
};

/** What the migrations made: their schemas, every relation and function in them, the fence. */
export type MigrationCatalog = {
  readonly schemas: readonly string[];
  /** Every table, view, materialized view, foreign table and sequence in those schemas. */
  readonly relations: readonly CatalogRelation[];
  readonly leagueTables: readonly LeagueTable[];
  readonly policies: readonly FencePolicy[];
  /** Every function in those schemas that no extension brought. */
  readonly functions: readonly FunctionShape[];
  /** Every trigger (not PostgreSQL's own for a foreign key) on a relation in those schemas. */
  readonly triggers: readonly CatalogTrigger[];
  /** Every rewrite rule on a relation in those schemas, but a view's own `_RETURN`. */
  readonly rules: readonly CatalogRule[];
};

/**
 * Runs `read` in a read-only transaction whose search path is empty (T-485), so PostgreSQL
 * prints every function, type and table in a policy, view, trigger or rule with its schema:
 * a policy calling a `current_league_id()` of another schema, found first on the login's
 * search path (its `"$user"` schema, or one set for the role), then reads as that schema's.
 * The catalog is written (migration-catalog-file.ts) and read at start (check-fence.ts) so.
 */
export function readQualified<T>(
  database: Kysely<Database>,
  read: (qualified: Kysely<Database>) => Promise<T>,
): Promise<T> {
  return database
    .transaction()
    .setAccessMode('read only')
    .execute(async (qualified) => {
      await sql`select pg_catalog.set_config('search_path', '', true)`.execute(qualified);
      return read(qualified);
    });
}

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

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** An extension's own objects, which the migrations did not write. */
const notOfAnExtension = (catalogTable: string, oid: RawBuilder<unknown>) => sql`
  not exists (
    select 1 from pg_catalog.pg_depend d
    where d.classid = ${sql.raw(`'${catalogTable}'`)}::pg_catalog.regclass and d.objid = ${oid}
      and d.deptype = 'e')`;

/**
 * The shape of every function in `schemas` that no extension brought (T-477, widened): the
 * same on PostgreSQL 16 and 17, since each part is stored as written, not printed back (a
 * SQL-standard body, printed back, is compared as a policy's rule is).
 */
export async function readFunctionShapes(
  database: Kysely<Database>,
  schemas: readonly string[],
): Promise<FunctionShape[]> {
  const { rows } = await sql<{
    signature: string;
    source: string;
    standard: string | null;
    settings: string[];
    owner: string;
    language: string;
    security_definer: boolean;
    volatility: string;
  }>`
    select pg_catalog.quote_ident(n.nspname) || '.' || pg_catalog.quote_ident(p.proname) ||
        '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' as signature,
      p.prosrc as source,
      case when p.prosqlbody is null then null
        else pg_catalog.pg_get_function_sqlbody(p.oid) end as standard,
      coalesce(p.proconfig, array[]::text[]) as settings,
      pg_catalog.pg_get_userbyid(p.proowner)::text as owner, l.lanname::text as language,
      p.prosecdef as security_definer, p.provolatile::text as volatility
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    join pg_catalog.pg_language l on l.oid = p.prolang
    where n.nspname::text in (
        select pg_catalog.jsonb_array_elements_text(${JSON.stringify(schemas)}::jsonb))
      and ${notOfAnExtension('pg_catalog.pg_proc', sql`p.oid`)}
    order by 1`.execute(database);
  return rows.map((row) => ({
    signature: row.signature,
    body: sha256(row.standard === null ? row.source : `${row.source}\0${rule(row.standard)}`),
    settings: row.settings,
    owner: row.owner,
    language: row.language,
    securityDefiner: row.security_definer,
    volatility: row.volatility,
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

/**
 * Every table, view, materialized view, foreign table and sequence in `schemas` that no
 * extension brought, with its kind, owner and, for a view, a hash of its definition and
 * options (security_invoker among them), compared as a policy's rule is (T-481).
 */
export async function readRelations(
  database: Kysely<Database>,
  schemas: readonly string[],
): Promise<CatalogRelation[]> {
  const { rows } = await sql<{
    name: string;
    kind: string;
    owner: string;
    view: string | null;
    options: string[] | null;
  }>`
    select pg_catalog.quote_ident(n.nspname) || '.' || pg_catalog.quote_ident(c.relname) as name,
      c.relkind::text as kind, pg_catalog.pg_get_userbyid(c.relowner)::text as owner,
      case when c.relkind in ('v', 'm') then pg_catalog.pg_get_viewdef(c.oid) end as view,
      c.reloptions::text[] as options
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
      and n.nspname::text in (
        select pg_catalog.jsonb_array_elements_text(${JSON.stringify(schemas)}::jsonb))
      and ${notOfAnExtension('pg_catalog.pg_class', sql`c.oid`)}
    order by 1`.execute(database);
  return rows.map((row) => ({
    name: row.name,
    kind: row.kind,
    owner: row.owner,
    definition:
      row.view === null
        ? null
        : sha256(`${rule(row.view) ?? ''}\0${[...(row.options ?? [])].sort().join(',')}`),
  }));
}

/**
 * Every trigger on a relation in `schemas` that no extension brought, but PostgreSQL's own
 * (a foreign key's), with its definition and whether it fires (T-486).
 */
export async function readTriggers(
  database: Kysely<Database>,
  schemas: readonly string[],
): Promise<CatalogTrigger[]> {
  const { rows } = await sql<{ table: string; name: string; definition: string; enabled: string }>`
    select pg_catalog.quote_ident(n.nspname) || '.' || pg_catalog.quote_ident(c.relname)
        as "table",
      pg_catalog.quote_ident(t.tgname) as name,
      pg_catalog.pg_get_triggerdef(t.oid) as definition, t.tgenabled::text as enabled
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal
      and n.nspname::text in (
        select pg_catalog.jsonb_array_elements_text(${JSON.stringify(schemas)}::jsonb))
      and ${notOfAnExtension('pg_catalog.pg_class', sql`c.oid`)}
    order by 1, 2`.execute(database);
  return rows.map((row) => ({ ...row, definition: rule(row.definition) ?? '' }));
}

/** Every rewrite rule on a relation in `schemas`, but a view's own `_RETURN` (T-486). */
export async function readRules(
  database: Kysely<Database>,
  schemas: readonly string[],
): Promise<CatalogRule[]> {
  const { rows } = await sql<{ table: string; name: string; definition: string; enabled: string }>`
    select pg_catalog.quote_ident(n.nspname) || '.' || pg_catalog.quote_ident(c.relname)
        as "table",
      pg_catalog.quote_ident(w.rulename) as name,
      pg_catalog.pg_get_ruledef(w.oid) as definition, w.ev_enabled::text as enabled
    from pg_catalog.pg_rewrite w
    join pg_catalog.pg_class c on c.oid = w.ev_class
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where w.rulename <> '_RETURN'
      and n.nspname::text in (
        select pg_catalog.jsonb_array_elements_text(${JSON.stringify(schemas)}::jsonb))
      and ${notOfAnExtension('pg_catalog.pg_class', sql`c.oid`)}
    order by 1, 2`.execute(database);
  return rows.map((row) => ({ ...row, definition: sha256(rule(row.definition) ?? '') }));
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
 * A policy's rule as compared: spacing does not count. Every name in it carries its schema,
 * since it is read with an empty search path (readQualified, T-485), so `public.` counts:
 * the same name in another schema is another function.
 */
export function rule(text: string | null): string | null {
  return text === null ? null : text.replace(/\s+/g, ' ').trim();
}
