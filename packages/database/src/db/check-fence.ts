// Step 2.238: the start-up guard reads the league fence itself, not only who holds the key.
// checkLoginRole (T-60) proves the login cannot step past row-level security; this proves
// the fence it cannot step past is whole. On the hosted database a person can change it by
// hand, so each start reads, in any schema but the server's own:
//   (a) every league table (fence-catalog.ts) has row-level security on and forced;
//   (b) every policy on a league table is one of the migrations' own, word for word
//       (migration-catalog.ts): a wider rule, such as `using (true)`, is refused by name;
//   (c) every SECURITY DEFINER function the login or a role it may become can run is on
//       the reviewed list (reviewed-definers.ts, T-469);
//   (d) every table, view and foreign table in the migrations' schemas is one they made.
// Each is named in a plain sentence with the one statement that puts it right.
import { sql, type Kysely } from 'kysely';
import { kyselyOf, type DatabaseHandle } from './database-handle.ts';
import {
  leagueTables,
  readFencePolicies,
  readRelations,
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
async function openTables(database: Kysely<Database>): Promise<string[]> {
  const { rows } = await sql<{ table_name: string; enabled: boolean; forced: boolean }>`
    with league_tables as (${leagueTables})
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
  for (const found of await readFencePolicies(database)) {
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
        `(now ${policyText(found)}): ${remedy}`,
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

const kindWords: Record<string, string> = {
  r: 'table',
  p: 'table',
  v: 'view',
  m: 'materialized view',
  f: 'foreign table',
};

/** (d) A table, view or foreign table in the migrations' schemas that they did not make. */
async function strangers(database: Kysely<Database>, catalog: MigrationCatalog): Promise<string[]> {
  const made = new Set(catalog.relations);
  return (await readRelations(database, catalog.schemas))
    .filter((relation) => !made.has(relation.name))
    .map(({ name, kind }) => {
      const what = kindWords[kind] ?? 'table';
      return (
        `${name} is a ${what} that no migration made, so nothing has checked its fence: ` +
        `drop ${what} ${name} (or make it in a migration)`
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
    ...(await openTables(database)),
    ...(await widePolicies(database, catalog)),
    ...(await unreviewedDefiners(database, roles)),
    ...(await strangers(database, catalog)),
  ];
}
