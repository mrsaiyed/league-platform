// Step 2.238: the start-up guard reads the league fence itself, not only who holds the key.
// checkLoginRole (T-60) proves the login cannot step past row-level security; this proves
// the fence it cannot step past is whole. On the hosted database a person can change it by
// hand, so each start reads, in any schema but the server's own:
//   (a) every league table (fence-catalog.ts) has row-level security on and forced, and
//       every one the migrations' catalog lists is there with its league column (T-470);
//   (b) every policy on a league table is one of the migrations' own, word for word
//       (migration-catalog.ts): a wider rule, such as `using (true)`, is refused by name;
//   (c) every SECURITY DEFINER function the login or a role it may become can run is on
//       the reviewed list (reviewed-definers.ts, T-469), and each reviewed one is as the
//       migrations made it: body, settings, owner, language and security (T-477);
//   (d) every table, view and foreign table in the migrations' schemas is one they made,
//       and in any other schema, none they did not make is readable by the login or a
//       role it may become (T-476): a copy or a view of a league's rows holds no fence.
// Each is named in a plain sentence with the one statement that puts it right.
import { sql, type Kysely } from 'kysely';
import { kyselyOf, type DatabaseHandle } from './database-handle.ts';
import {
  leagueTables,
  readDefinerShapes,
  readFencePolicies,
  type DefinerShape,
  type FencePolicy,
  type MigrationCatalog,
} from './fence-catalog.ts';
import { migrationCatalog } from './migration-catalog.ts';
import { reviewedDefiners } from './reviewed-definers.ts';
import type { Database } from './schema-types.ts';

/** Who the login is, the roles it may become (SET ROLE), and every role it reaches. */
export type FenceRoles = {
  readonly login: string;
  readonly mayBecome: readonly string[];
  readonly reached: readonly string[];
  /** The database's owner, for a function a reached role owns. */
  readonly databaseOwner: string;
};

/** (a) A league table whose row-level security is not on and forced. */
async function openTables(
  database: Kysely<Database>,
  catalog: MigrationCatalog,
): Promise<string[]> {
  const listed = catalog.leagueTables.map((table) => table.table);
  const { rows } = await sql<{ table_name: string; enabled: boolean; forced: boolean }>`
    with league_tables as (${leagueTables(listed)})
    select table_name, enabled, forced from league_tables
    where not (enabled and forced)
    order by 1`.execute(database);
  return rows.map(({ table_name: table, enabled, forced }) => {
    const statement = `alter table ${table} ${
      enabled
        ? 'force row level security'
        : forced
          ? 'enable row level security'
          : 'enable row level security, force row level security'
    }`;
    const state = enabled
      ? 'is on but not forced, so its owner sees every league'
      : 'is off, so every role that may read it sees every league';
    return `${table} has a league column but its row-level security ${state}: ${statement}`;
  });
}

/** (a) A league table the catalog lists that is missing, or whose league column is not. */
async function lostLeagueColumns(
  database: Kysely<Database>,
  catalog: MigrationCatalog,
): Promise<string[]> {
  const { rows } = await sql<{
    table: string;
    column: string;
    present: boolean;
    has_column: boolean;
    now_named: string | null;
  }>`
    select l."table", l."column", c.oid is not null as present,
      exists (
        select 1 from pg_catalog.pg_attribute a
        where a.attrelid = c.oid and a.attname = l."column" and a.attnum > 0
          and not a.attisdropped) as has_column,
      (select pg_catalog.quote_ident(a.attname) from pg_catalog.pg_attribute a
       where a.attrelid = c.oid and a.attnum = l.place and not a.attisdropped) as now_named
    from pg_catalog.jsonb_to_recordset(${JSON.stringify(catalog.leagueTables)}::jsonb)
      as l("table" text, "column" text, place int)
    left join pg_catalog.pg_class c
      on c.oid = pg_catalog.to_regclass(l."table") and c.relkind in ('r', 'p')
    where c.oid is null or not exists (
      select 1 from pg_catalog.pg_attribute a
      where a.attrelid = c.oid and a.attname = l."column" and a.attnum > 0
        and not a.attisdropped)
    order by 1`.execute(database);
  return rows.map(({ table, column, present, now_named: nowNamed }) => {
    const start = `${table} is a league table the migrations made, but`;
    if (!present)
      return `${start} it is missing, so its fence cannot be read: make it again as its migration does`;
    if (nowNamed !== null)
      return (
        `${start} its league column ${column} is now named ${nowNamed}, so its fence cannot ` +
        `be read: alter table ${table} rename column ${nowNamed} to ${column}`
      );
    return (
      `${start} its league column ${column} is gone, so its rows no longer say their league: ` +
      `drop table ${table}, then make it again as its migration does`
    );
  });
}

const policyText = (policy: FencePolicy) =>
  `to ${policy.roles}` +
  (policy.using === null ? '' : ` using (${policy.using})`) +
  (policy.check === null ? '' : ` with check (${policy.check})`);

/** (b) A policy on a league table that is not one of the migrations', word for word. */
async function widePolicies(
  database: Kysely<Database>,
  catalog: MigrationCatalog,
): Promise<string[]> {
  const own = new Map(catalog.policies.map((policy) => [`${policy.table} ${policy.name}`, policy]));
  const problems: string[] = [];
  const listed = catalog.leagueTables.map((table) => table.table);
  for (const found of await readFencePolicies(database, listed)) {
    const name = `${found.name} on ${found.table}`;
    const made = own.get(`${found.table} ${found.name}`);
    if (made === undefined) {
      problems.push(
        `${found.table} has a policy ${found.name} that no migration made, so its rule ` +
          `(${policyText(found)}) is not known to name the league: drop policy ${name}`,
      );
      continue;
    }
    const same =
      found.permissive === made.permissive &&
      found.command === made.command &&
      found.roles === made.roles &&
      found.using === made.using &&
      found.check === made.check;
    if (same) continue;
    const remedy =
      found.permissive === made.permissive && found.command === made.command
        ? `alter policy ${name} ${policyText(made)}`
        : `drop policy ${name}, then make it again as its migration does`;
    problems.push(
      `${found.table} has its policy ${found.name} changed from the migrations' ` +
        `(now ${found.permissive ? '' : 'as restrictive '}` +
        `${found.command === 'all' ? '' : `for ${found.command} `}${policyText(found)}): ${remedy}`,
    );
  }
  return problems;
}

type Definer = {
  signature: string;
  kind: string;
  owner: string;
  runner: string;
  grantees: string[];
};

/** (c) A security-definer function the login may run that is not on the reviewed list. */
async function unreviewedDefiners(
  database: Kysely<Database>,
  roles: FenceRoles,
): Promise<string[]> {
  const runners = JSON.stringify([roles.login, ...roles.mayBecome]);
  const { rows } = await sql<Definer>`
    select * from (
      select pg_catalog.quote_ident(n.nspname) || '.' || pg_catalog.quote_ident(p.proname) ||
          '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' as signature,
        p.prokind::text as kind, pg_catalog.pg_get_userbyid(p.proowner)::text as owner,
        (select r.name from pg_catalog.jsonb_array_elements_text(${runners}::jsonb)
            with ordinality as r(name, place)
         where pg_catalog.has_function_privilege(r.name, p.oid, 'EXECUTE')
         order by r.place limit 1) as runner,
        case when p.proacl is null then array['public']
          else array(
            select distinct case when e.grantee = 0 then 'public'
              else pg_catalog.pg_get_userbyid(e.grantee)::text end
            from pg_catalog.aclexplode(p.proacl) e
            where e.privilege_type = 'EXECUTE' order by 1)
          end as grantees
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where p.prosecdef and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
        and p.prorettype not in (
          'pg_catalog.trigger'::pg_catalog.regtype, 'pg_catalog.event_trigger'::pg_catalog.regtype)
    ) definers
    where runner is not null
    order by signature`.execute(database);
  const reached = new Set(['public', ...roles.reached]);
  return rows
    .filter((definer) => !reviewedDefiners.has(definer.signature))
    .map((definer) => {
      const what = definer.kind === 'p' ? 'procedure' : 'function';
      const holders = definer.grantees.filter((grantee) => reached.has(grantee));
      const statement =
        holders.length > 0
          ? `revoke execute on ${what} ${definer.signature} from ${holders.join(', ')}`
          : `alter ${what} ${definer.signature} owner to ${roles.databaseOwner}`;
      const who =
        definer.runner === roles.login
          ? roles.login
          : `${roles.login} may become ${definer.runner}, which`;
      return (
        `${who} may run ${definer.signature}, a security-definer ${what} that is not on ` +
        `the reviewed list, so it may read past the league fence: ${statement}`
      );
    });
}

const shapeParts: readonly [keyof DefinerShape, string][] = [
  ['body', 'body'],
  ['settings', 'settings'],
  ['owner', 'owner'],
  ['language', 'language'],
  ['securityDefiner', 'security'],
];

/** (c) A reviewed security-definer function changed since the migrations made it (T-477). */
async function changedDefiners(
  database: Kysely<Database>,
  catalog: MigrationCatalog,
): Promise<string[]> {
  const found = new Map(
    (
      await readDefinerShapes(
        database,
        catalog.definers.map((definer) => definer.signature),
      )
    ).map((shape) => [shape.signature, shape]),
  );
  return catalog.definers.flatMap((made) => {
    const now = found.get(made.signature);
    if (now === undefined) return [];
    const changed = shapeParts
      .filter(([part]) => JSON.stringify(now[part]) !== JSON.stringify(made[part]))
      .map(([, words]) => words);
    if (changed.length === 0) return [];
    return [
      `${made.signature} is a reviewed security-definer function whose ${changed.join(', ')} ` +
        `changed since the migrations made it, so its review no longer holds: run the ` +
        `migrations' own definition again`,
    ];
  });
}

const kindWords: Record<string, string> = {
  r: 'table',
  p: 'table',
  v: 'view',
  m: 'materialized view',
  f: 'foreign table',
};

type Stranger = {
  name: string;
  kind: string;
  ours: boolean;
  reader: string | null;
  holders: string[];
};

/**
 * (d) A table, view or foreign table no migration made: any in the migrations' schemas,
 * and in every other schema but the server's own, one the login or a role it may become
 * can read (T-476). An extension's object the login cannot read is let be.
 */
async function strangers(
  database: Kysely<Database>,
  catalog: MigrationCatalog,
  roles: FenceRoles,
): Promise<string[]> {
  const readers = JSON.stringify([roles.login, ...roles.mayBecome]);
  const { rows } = await sql<Stranger>`
    select * from (
      select pg_catalog.quote_ident(n.nspname) || '.' || pg_catalog.quote_ident(c.relname)
          as name,
        c.relkind::text as kind,
        n.nspname::text in (
          select pg_catalog.jsonb_array_elements_text(${JSON.stringify(catalog.schemas)}::jsonb))
          as ours,
        (select r.name from pg_catalog.jsonb_array_elements_text(${readers}::jsonb)
            with ordinality as r(name, place)
         where pg_catalog.has_schema_privilege(r.name, n.oid, 'USAGE')
           and pg_catalog.has_any_column_privilege(r.name, c.oid, 'SELECT')
         order by r.place limit 1) as reader,
        array(
          select distinct case when e.grantee = 0 then 'public'
            else pg_catalog.pg_get_userbyid(e.grantee)::text end
          from (
            select (pg_catalog.aclexplode(c.relacl)).*
            union all
            select (pg_catalog.aclexplode(a.attacl)).* from pg_catalog.pg_attribute a
            where a.attrelid = c.oid and a.attacl is not null
          ) e
          where e.privilege_type = 'SELECT' order by 1) as holders
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p', 'v', 'm', 'f')
        and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
        and pg_catalog.quote_ident(n.nspname) || '.' || pg_catalog.quote_ident(c.relname)
          not in (
            select pg_catalog.jsonb_array_elements_text(${JSON.stringify(catalog.relations)}::jsonb))
    ) relations
    where ours or reader is not null
    order by name`.execute(database);
  const reached = new Set(['public', ...roles.reached]);
  return rows.map(({ name, kind, ours, reader, holders }) => {
    const what = kindWords[kind] ?? 'table';
    if (ours)
      return (
        `${name} is a ${what} that no migration made, so nothing has checked its fence: ` +
        `drop ${what} ${name} (or make it in a migration)`
      );
    const from = holders.filter((holder) => reached.has(holder));
    const statement =
      from.length > 0
        ? `revoke select on table ${name} from ${from.join(', ')}`
        : `drop ${what} ${name}`;
    const who =
      reader === roles.login ? roles.login : `${roles.login} may become ${String(reader)}, which`;
    return (
      `${name} is a ${what} that no migration made, and ${who} may read it, so nothing has ` +
      `checked its fence: ${statement}`
    );
  });
}

/**
 * What is wrong with the league fence of the database `db` opens, in plain sentences, each
 * naming the table, policy or function and the statement that puts it right. Empty means
 * whole. `catalog` is what the migrations made; tests pass their own.
 */
export async function checkFence(
  db: DatabaseHandle,
  roles: FenceRoles,
  catalog: MigrationCatalog = migrationCatalog,
): Promise<string[]> {
  const database = kyselyOf(db);
  return [
    ...(await lostLeagueColumns(database, catalog)),
    ...(await openTables(database, catalog)),
    ...(await widePolicies(database, catalog)),
    ...(await unreviewedDefiners(database, roles)),
    ...(await changedDefiners(database, catalog)),
    ...(await strangers(database, catalog, roles)),
  ];
}
