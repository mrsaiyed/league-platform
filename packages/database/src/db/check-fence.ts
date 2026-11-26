// Step 2.238: the start-up guard reads the league fence itself, not only who holds the key.
// checkLoginRole (T-60) proves the login cannot step past row-level security; this proves
// the fence it cannot step past is whole. On the hosted database a person can change it by
// hand, so each start reads, in any schema but the server's own:
//   (a) every league table (fence-catalog.ts) has row-level security on and forced, and
//       every one the migrations' catalog lists is there with its league column (T-470);
//   (b) every policy on a league table is one of the migrations' own, word for word
//       (migration-catalog.ts): a wider rule, such as `using (true)`, is refused by name;
//       and every one of theirs is there (a missing one fails closed, but is named);
//   (c) every SECURITY DEFINER function the login or a role it may become can run is on
//       the reviewed list (reviewed-definers.ts, T-469), and every function the migrations
//       made (current_league_id, which every fence policy calls, among them) is as they
//       made it: body, settings, owner, language, security and volatility (T-477);
//   (d) every relation the migrations made is there, of the same kind, owner and, for a
//       view, definition (T-481); every table, view and foreign table in their schemas is
//       one they made, and in any other schema, none they did not make is readable by the
//       login or a role it may become (T-476): a copy or a view of a league's rows holds no
//       fence. In a library's own schema (library-schemas.ts, T-482; none today) and,
//       for the worker's login only, in the job queue's (T-490) only ordinary tables
//       without a league column are let be; any view or foreign table there is refused;
//       Since step 2.112's review (T-492) a relation counts when the login or a role it
//       reaches has ANY right on it (insert alone is enough), not only a reading one; and
//       (T-493) a table with a league column in the job queue's schema is refused for the
//       worker too, mended by moving it out to the migrations' owner, never by a revoke or
//       a drop; and (T-494) a table named like pg-boss's own in public is never dropped;
//   (c') every security-definer function a trigger runs on a relation the login or a role
//       it reaches may change is on the reviewed list or is one the migrations made (T-492):
//       a change the website may make there runs it as its owner;
//   (e) every trigger and rewrite rule on a relation the migrations made is theirs, as
//       they made it and enabled (T-486): a rule that copies a league's rows elsewhere on
//       each change, or a trigger that does, opens the fence without touching a policy.
// All is read in one transaction with an empty search path (T-485), so every function a
// policy calls is printed with its schema. Each is named in a plain sentence with the one
// statement that puts it right.
import { sql, type Kysely } from 'kysely';
import { kyselyOf, type DatabaseHandle } from './database-handle.ts';
import {
  leagueTables,
  readFencePolicies,
  readFunctionShapes,
  readQualified,
  readRelations,
  readRules,
  readTriggers,
  type CatalogRule,
  type CatalogTrigger,
  type FencePolicy,
  type FunctionShape,
  type MigrationCatalog,
} from './fence-catalog.ts';
import { queueSchema } from './check-queue-schema.ts';
import { librarySchemas } from './library-schemas.ts';
import { asRole, holdingRole } from './mending.ts';
import { migrationCatalog } from './migration-catalog.ts';
import { reviewedDefiners } from './reviewed-definers.ts';
import type { Database } from './schema-types.ts';

/** The login first, then every other role it reaches. */
const reachedRoles = (roles: FenceRoles) =>
  JSON.stringify([roles.login, ...roles.reached.filter((role) => role !== roles.login)]);

/** Who the login is, the roles it may become (SET ROLE), and every role it reaches. */
export type FenceRoles = {
  readonly login: string;
  readonly mayBecome: readonly string[];
  readonly reached: readonly string[];
  /** The database's owner, for a function a reached role owns. */
  readonly databaseOwner: string;
  /**
   * The job queue's schema, for the worker's login only (T-490): there, as in a library's
   * schema, an ordinary table without a league column is let be. The website gets none.
   */
  readonly queueSchema?: string;
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
    left join lateral (
      -- By name from the catalog, not to_regclass, which needs the use of the schema.
      select k.oid from pg_catalog.pg_class k
      join pg_catalog.pg_namespace n on n.oid = k.relnamespace
      where pg_catalog.quote_ident(n.nspname) || '.' || pg_catalog.quote_ident(k.relname) =
          l."table"
        and k.relkind in ('r', 'p')
    ) c on true
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

/** The statement that makes a migration's policy again as they made it. */
const createPolicy = (policy: FencePolicy) =>
  `create policy ${policy.name} on ${policy.table} as ` +
  `${policy.permissive ? 'permissive' : 'restrictive'} for ${policy.command} ${policyText(policy)}`;

/**
 * (b) A policy on a league table that is not one of the migrations', word for word, and
 * one of theirs that is missing from a league table that is there.
 */
async function widePolicies(
  database: Kysely<Database>,
  catalog: MigrationCatalog,
): Promise<string[]> {
  const own = new Map(catalog.policies.map((policy) => [`${policy.table} ${policy.name}`, policy]));
  const problems: string[] = [];
  const listed = catalog.leagueTables.map((table) => table.table);
  const seen = new Set<string>();
  for (const found of await readFencePolicies(database, listed)) {
    seen.add(`${found.table} ${found.name}`);
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
  // Read from the catalog by name, not to_regclass, which needs the use of the schema.
  const { rows: present } = await sql<{ table: string }>`
    with league_tables as (${leagueTables(listed)})
    select table_name as "table" from league_tables`.execute(database);
  const there = new Set(present.map((row) => row.table));
  for (const made of catalog.policies) {
    if (seen.has(`${made.table} ${made.name}`) || !there.has(made.table)) continue;
    problems.push(
      `${made.table} is missing its policy ${made.name}, which the migrations made, so its ` +
        `rows are not fenced as they meant: ${createPolicy(made)}`,
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
          ? asRole(
              definer.owner,
              `revoke execute on ${what} ${definer.signature} from ${holders.join(', ')}`,
              roles.databaseOwner,
            )
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

type TriggerDefiner = {
  signature: string;
  trigger: string;
  table: string;
  table_owner: string;
  changer: string;
};

/**
 * (c') A security-definer function that a trigger runs on a relation the login or a role it
 * reaches may change, not on the reviewed list and not the migrations' own (whose shape
 * changedFunctions reads). Seen on the real server: a table the website could only insert
 * into, outside every schema the guard read, with a definer trigger that wrote a queued job.
 */
async function unreviewedTriggerDefiners(
  database: Kysely<Database>,
  catalog: MigrationCatalog,
  roles: FenceRoles,
): Promise<string[]> {
  const own = new Set(catalog.functions.map((made) => made.signature));
  // Every trigger on a relation the migrations made is (e)'s to judge, word for word.
  const theirs = new Set(catalog.relations.map((relation) => relation.name));
  const { rows } = await sql<TriggerDefiner>`
    select * from (
      select pg_catalog.quote_ident(pn.nspname) || '.' || pg_catalog.quote_ident(p.proname) ||
          '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' as signature,
        pg_catalog.quote_ident(t.tgname) as trigger,
        pg_catalog.quote_ident(n.nspname) || '.' || pg_catalog.quote_ident(c.relname) as "table",
        pg_catalog.pg_get_userbyid(c.relowner)::text as table_owner,
        (select r.name from pg_catalog.jsonb_array_elements_text(${reachedRoles(roles)}::jsonb)
            with ordinality as r(name, place)
         where pg_catalog.has_schema_privilege(r.name, n.oid, 'USAGE')
           and (pg_catalog.has_table_privilege(r.name, c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE')
             or pg_catalog.has_any_column_privilege(r.name, c.oid, 'INSERT, UPDATE'))
         order by r.place limit 1) as changer
      from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c on c.oid = t.tgrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      join pg_catalog.pg_proc p on p.oid = t.tgfoid
      join pg_catalog.pg_namespace pn on pn.oid = p.pronamespace
      where not t.tgisinternal and p.prosecdef
    ) triggers
    where changer is not null
    order by "table", trigger`.execute(database);
  return rows
    .filter(
      (found) =>
        !reviewedDefiners.has(found.signature) &&
        !own.has(found.signature) &&
        !theirs.has(found.table),
    )
    .map((found) => {
      const who =
        found.changer === roles.login
          ? roles.login
          : `${roles.login} may become ${found.changer}, which`;
      return (
        `${who} may change ${found.table}, whose trigger ${found.trigger} runs ` +
        `${found.signature}, a security-definer function that is not on the reviewed list, ` +
        `so a change there may reach past the league fence or into the job queue: ` +
        asRole(
          found.table_owner,
          `drop trigger ${found.trigger} on ${found.table}`,
          roles.databaseOwner,
        )
      );
    });
}

const shapeParts: readonly [keyof FunctionShape, string][] = [
  ['body', 'body'],
  ['settings', 'settings'],
  ['owner', 'owner'],
  ['language', 'language'],
  ['securityDefiner', 'security'],
  ['volatility', 'volatility'],
];

/**
 * (c) A function the migrations made that is missing or changed since (T-477, widened):
 * each fence policy calls current_league_id, so one that names another league opens it.
 */
async function changedFunctions(
  database: Kysely<Database>,
  catalog: MigrationCatalog,
): Promise<string[]> {
  const found = new Map(
    (await readFunctionShapes(database, catalog.schemas)).map((shape) => [shape.signature, shape]),
  );
  const again = "run the migrations' own definition again";
  return catalog.functions.flatMap((made) => {
    const now = found.get(made.signature);
    const what = reviewedDefiners.has(made.signature)
      ? 'a reviewed security-definer function'
      : 'a function the migrations made';
    if (now === undefined)
      return [`${made.signature} is ${what}, but it is missing, so what calls it fails: ${again}`];
    const changed = shapeParts
      .filter(([part]) => JSON.stringify(now[part]) !== JSON.stringify(made[part]))
      .map(([, words]) => words);
    if (changed.length === 0) return [];
    const why = reviewedDefiners.has(made.signature)
      ? 'its review no longer holds'
      : 'the fence or the command that calls it may no longer hold';
    return [
      `${made.signature} is ${what} whose ${changed.join(', ')} ` +
        `changed since the migrations made it, so ${why}: ${again}`,
    ];
  });
}

const kindWords: Record<string, string> = {
  r: 'table',
  p: 'table',
  v: 'view',
  m: 'materialized view',
  f: 'foreign table',
  S: 'sequence',
};

/**
 * (d) A relation the migrations made that is missing, or of another kind, owner or view
 * definition (T-481): a table moved away and a view of another table put in its place
 * keeps its name, and so passed the check of names alone.
 */
async function changedRelations(
  database: Kysely<Database>,
  catalog: MigrationCatalog,
): Promise<string[]> {
  const found = new Map(
    (await readRelations(database, catalog.schemas)).map((relation) => [relation.name, relation]),
  );
  const again = "run the migrations' own definition again";
  return catalog.relations.flatMap((made) => {
    const what = kindWords[made.kind] ?? 'table';
    const start = `${made.name} is a ${what} the migrations made, but`;
    const now = found.get(made.name);
    if (now === undefined) return [`${start} it is missing, so what reads it fails: ${again}`];
    if (now.kind !== made.kind) {
      const nowWhat = kindWords[now.kind] ?? 'table';
      return [
        `${start} it is now a ${nowWhat}, so it may hold rows of any league: ` +
          `drop ${nowWhat} ${made.name}, then ${again}`,
      ];
    }
    if (now.owner !== made.owner)
      return [
        `${start} it is now owned by ${now.owner}, not ${made.owner}, so it may not be what ` +
          `they made: alter ${what} ${made.name} owner to ${made.owner}`,
      ];
    if (now.definition !== made.definition)
      return [`${start} its definition changed, so it may read rows of any league: ${again}`];
    return [];
  });
}

const notEnabled = (enabled: string) =>
  enabled === 'D' ? 'disabled' : 'not enabled as the migrations left it';

/**
 * (e) A trigger or rule on a relation the migrations made that no migration made, or one of
 * theirs missing, changed or not enabled as they left it (T-486).
 */
async function changedTriggersAndRules(
  database: Kysely<Database>,
  catalog: MigrationCatalog,
): Promise<string[]> {
  const made = new Set(catalog.relations.map((relation) => relation.name));
  const again = "run the migrations' own definition again";
  const compare = (
    what: 'trigger' | 'rule',
    theirs: readonly (CatalogTrigger | CatalogRule)[],
    found: readonly (CatalogTrigger | CatalogRule)[],
  ): string[] => {
    const key = (one: CatalogTrigger | CatalogRule) => `${one.table} ${one.name}`;
    const own = new Map(theirs.map((one) => [key(one), one]));
    const seen = new Set(found.map(key));
    const does = what === 'trigger' ? 'does on each change' : 'puts in place of each change';
    const problems = found
      .filter((now) => made.has(now.table))
      .flatMap((now) => {
        const was = own.get(key(now));
        const name = `${what} ${now.name} on ${now.table}`;
        if (was === undefined)
          return [
            `${now.table} has a ${what} ${now.name} that no migration made, so what it ${does} ` +
              `is not known to keep to the league fence: drop ${name}`,
          ];
        if (now.definition !== was.definition)
          return [
            `${now.table} has its ${what} ${now.name} changed from the migrations', so what it ` +
              `${does} may cross the league fence: drop ${name}, then ${again}`,
          ];
        if (now.enabled !== was.enabled)
          return [
            `${now.table} has its ${what} ${now.name}, which the migrations made, ` +
              `${notEnabled(now.enabled)}, so what it keeps is not kept: ` +
              `alter table ${now.table} enable ${what} ${now.name}`,
          ];
        return [];
      });
    for (const was of theirs)
      if (!seen.has(key(was)) && made.has(was.table))
        problems.push(
          `${was.table} is missing its ${what} ${was.name}, which the migrations made, so what ` +
            `it keeps is not kept: ${again}`,
        );
    return problems;
  };
  return [
    ...compare('trigger', catalog.triggers, await readTriggers(database, catalog.schemas)),
    ...compare('rule', catalog.rules, await readRules(database, catalog.schemas)),
  ];
}

/** pg-boss's own tables (T-494): one of these in public is from before 0031, with jobs. */
const queueTableNames = new Set([
  'archive',
  'bam',
  'instance',
  'job',
  'job_common',
  'job_dependency',
  'queue',
  'queue_stats',
  'schedule',
  'subscription',
  'version',
  'warning',
]);

type Stranger = {
  name: string;
  /** Its own name, and its schema's, quoted. */
  bare: string;
  schema_name: string;
  owner: string;
  /** The first role that may use it reads it too; else it may only change it. */
  reads: boolean;
  /** Holders of a right on it other than SELECT. */
  writers: string[];
  leagueish: boolean;
  kind: string;
  ours: boolean;
  reader: string | null;
  holders: string[];
  library: boolean;
  /** In pg-boss's schema, whoever is judged: its tables are never dropped (T-490). */
  queue: boolean;
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
  const readers = reachedRoles(roles);
  const libraries = JSON.stringify([
    ...librarySchemas.keys(),
    ...(roles.queueSchema === undefined ? [] : [roles.queueSchema]),
  ]);
  const listed = catalog.leagueTables.map((table) => table.table);
  const { rows } = await sql<Stranger>`
    with league_tables as (${leagueTables(listed)})
    select name, bare, schema_name, owner, kind, ours and not library as ours, reader,
      reader is not null and pg_catalog.has_any_column_privilege(reader, oid, 'SELECT') as reads,
      holders, writers, library, queue, leagueish from (
      select pg_catalog.quote_ident(n.nspname) || '.' || pg_catalog.quote_ident(c.relname)
          as name,
        c.oid, pg_catalog.quote_ident(c.relname) as bare, n.nspname::text as schema_name,
        pg_catalog.pg_get_userbyid(c.relowner)::text as owner,
        c.relkind::text as kind,
        n.nspname::text in (
          select pg_catalog.jsonb_array_elements_text(${JSON.stringify(catalog.schemas)}::jsonb))
          as ours,
        (select r.name from pg_catalog.jsonb_array_elements_text(${readers}::jsonb)
            with ordinality as r(name, place)
         where pg_catalog.has_schema_privilege(r.name, n.oid, 'USAGE')
           and (pg_catalog.has_table_privilege(r.name, c.oid,
               'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
             or pg_catalog.has_any_column_privilege(r.name, c.oid,
               'SELECT, INSERT, UPDATE, REFERENCES'))
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
          where e.grantee <> c.relowner order by 1) as holders,
        array(
          select distinct case when e.grantee = 0 then 'public'
            else pg_catalog.pg_get_userbyid(e.grantee)::text end
          from (
            select (pg_catalog.aclexplode(c.relacl)).*
            union all
            select (pg_catalog.aclexplode(a.attacl)).* from pg_catalog.pg_attribute a
            where a.attrelid = c.oid and a.attacl is not null
          ) e
          where e.grantee <> c.relowner and e.privilege_type <> 'SELECT' order by 1) as writers,
        n.nspname::text in (select pg_catalog.jsonb_array_elements_text(${libraries}::jsonb))
          as library,
        n.nspname::text = ${queueSchema} as queue,
        exists (
          select 1 from pg_catalog.pg_attribute a
          where a.attrelid = c.oid and a.attname = 'league_id' and a.attnum > 0
            and not a.attisdropped)
        or exists (
          select 1 from pg_catalog.pg_rewrite w
          join pg_catalog.pg_depend d
            on d.classid = 'pg_catalog.pg_rewrite'::pg_catalog.regclass and d.objid = w.oid
          join league_tables t on t.oid = d.refobjid
          where w.ev_class = c.oid) as leagueish
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p', 'v', 'm', 'f')
        and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
        and pg_catalog.quote_ident(n.nspname) || '.' || pg_catalog.quote_ident(c.relname)
          not in (
            select pg_catalog.jsonb_array_elements_text(${JSON.stringify(
              catalog.relations.map((relation) => relation.name),
            )}::jsonb))
    ) relations
    -- In a library's schema only an ordinary table without a league column is let be
    -- (T-482, tightened): a view, materialized view or foreign table there never is.
    where (ours or reader is not null) and not (library and kind in ('r', 'p') and not leagueish)
      -- The website's reach of the job queue is queueReachProblems' to name (T-491).
      and not (queue and ${roles.queueSchema === undefined}::boolean)
    order by name`.execute(database);
  const reached = new Set(['public', ...roles.reached]);
  return rows.map((row) => {
    const { name, kind, ours, reader, holders, library, queue } = row;
    const what = kindWords[kind] ?? 'table';
    const isTable = kind === 'r' || kind === 'p';
    const who =
      reader === roles.login ? roles.login : `${roles.login} may become ${String(reader)}, which`;
    if (queue && row.leagueish && isTable) {
      // T-493: a league's rows in the queue's schema, held by the worker or queue_owner,
      // whose owner may switch the fence off; a revoke the owner can undo is no mending.
      const move = holdingRole(
        row.owner,
        [
          `alter table ${name} set schema public`,
          `alter table public.${row.bare} owner to ${roles.databaseOwner}`,
        ],
        roles.databaseOwner,
      );
      return (
        `${name} has a league column, so it does not belong in the job queue's schema, which ` +
        `is for pg-boss's own tables: ${who} may use it there, and its owner ${row.owner} could ` +
        `switch its fence off; give it to the migrations' owner, out of the queue's schema ` +
        `(its rows are kept): ${move}`
      );
    }
    if (ours && isTable && row.schema_name === 'public' && queueTableNames.has(row.bare))
      // T-494: pg-boss's tables from before the queue had its own schema may hold jobs.
      return (
        `${name} is a table that no migration made, named like one of pg-boss's own, so it ` +
        `may hold queued jobs from before the job queue had its own schema, and nothing has ` +
        `checked its fence: do not drop it; ask the lead, who moves its jobs or drops it (T-494)`
      );
    if (ours)
      return (
        `${name} is a ${what} that no migration made, so nothing has checked its fence: ` +
        `drop ${what} ${name} (or make it in a migration)`
      );
    const from = holders.filter((holder) => reached.has(holder));
    const rights = row.writers.some((holder) => reached.has(holder)) ? 'all' : 'select';
    // In a library's schema the library's own tables are never dropped (T-482), nor
    // pg-boss's in its schema, even where the website is judged (T-490): a login that reads
    // them is the worker's, and the queue sentence (revoke queue_owner) says so.
    const statement =
      from.length > 0
        ? asRole(
            row.owner,
            `revoke ${rights} on table ${name} from ${from.join(', ')}`,
            roles.databaseOwner,
          )
        : (library || queue) && (kind === 'r' || kind === 'p')
          ? `revoke select on table ${name} from ${String(reader)}`
          : `drop ${what} ${name}`;
    return (
      `${name} is a ${what} that no migration made, and ${who} may ` +
      `${row.reads ? 'read' : 'change'} it, so nothing has ` +
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
  return readQualified(kyselyOf(db), async (database) => [
    ...(await lostLeagueColumns(database, catalog)),
    ...(await openTables(database, catalog)),
    ...(await widePolicies(database, catalog)),
    ...(await unreviewedDefiners(database, roles)),
    ...(await unreviewedTriggerDefiners(database, catalog, roles)),
    ...(await changedFunctions(database, catalog)),
    ...(await changedRelations(database, catalog)),
    ...(await changedTriggersAndRules(database, catalog)),
    ...(await strangers(database, catalog, roles)),
  ]);
}
