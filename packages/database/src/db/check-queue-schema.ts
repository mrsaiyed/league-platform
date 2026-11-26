// T-257 (record 053), T-490: pg-boss keeps its own tables in the `pgboss` schema. On a
// hosted database the worker never creates a schema: the release (migration 0031) makes
// `pgboss`, owned by the role queue_owner, and the worker's login is granted queue_owner,
// so pg-boss can make and upgrade its tables there and nothing in public. The worker calls
// checkQueueSchema once at start-up, before pg-boss starts, and refuses to start on any
// problem, so a missing step of the release reads as plain words instead of a driver
// error. The website's login must reach none of it (queueReachProblems, run by
// checkLoginRole): a queued job is the worker's alone.
import { sql } from 'kysely';
import { kyselyOf, type DatabaseHandle } from './database-handle.ts';
import { asRole } from './mending.ts';

/** The schema pg-boss's own tables live in (create-pg-boss.ts). */
export const queueSchema = 'pgboss';

/** The role with no login that owns the queue's schema (migration 0031). */
export const queueOwner = 'queue_owner';

type SchemaFacts = { found: boolean; owner: string | null; can_use: boolean; can_create: boolean };

/**
 * What stops the role the handle logs in as (or `role`, for tests) from running
 * pg-boss in its schema, in plain words. Empty means pg-boss can start.
 */
export async function checkQueueSchema(db: DatabaseHandle, role?: string): Promise<string[]> {
  const { rows } = await sql<SchemaFacts>`
    select n.oid is not null as found,
      pg_catalog.pg_get_userbyid(n.nspowner)::text as owner,
      coalesce(pg_catalog.has_schema_privilege(
        coalesce(${role ?? null}::text, session_user), n.oid, 'USAGE'), false) as can_use,
      coalesce(pg_catalog.has_schema_privilege(
        coalesce(${role ?? null}::text, session_user), n.oid, 'CREATE'), false) as can_create
    from (select 1) as one
    left join pg_catalog.pg_namespace n on n.nspname = ${queueSchema}`.execute(kyselyOf(db));
  const facts = rows[0];
  if (facts === undefined || !facts.found) {
    return [`the ${queueSchema} schema does not exist (the release makes it, record 053)`];
  }
  const problems: string[] = [];
  // Its owner holds every right on every job: only the role with no login may (T-490).
  if (facts.owner !== queueOwner) {
    problems.push(
      `the ${queueSchema} schema is owned by ${String(facts.owner)}, not ${queueOwner}: ` +
        giveSchemaToQueueOwner,
    );
  }
  // pg-boss needs both: USAGE to reach its tables, CREATE to make and upgrade them.
  if (!facts.can_use) {
    problems.push(`the login role may not use the ${queueSchema} schema (grant it queue_owner)`);
  }
  if (!facts.can_create) {
    problems.push(
      `the login role may not make tables in the ${queueSchema} schema (grant it queue_owner)`,
    );
  }
  return problems;
}

/**
 * The mending that gives the schema back to queue_owner, as the owner can run it: ALTER
 * SCHEMA … OWNER needs the right to become the new owner, which the database's owner holds
 * only for that one statement (as 0031 does). Seen on the real server: the bare statement
 * failed with "must be able to SET ROLE".
 */
const giveSchemaToQueueOwner =
  `grant ${queueOwner} to current_user with set true; ` +
  `alter schema ${queueSchema} owner to ${queueOwner}; revoke ${queueOwner} from current_user`;

/** The website's login, and every role it reaches with the way there (checkLoginRole's). */
export type QueueReach = {
  readonly login: string;
  /** A superuser reaches everything; its being one is reported by checkLoginRole. */
  readonly superuser: boolean;
  /** Each from the login to a role it is a member of, at any depth, both ends included. */
  readonly paths: readonly (readonly string[])[];
  /** The database's owner, who runs every mending on a hosted database. */
  readonly databaseOwner: string;
};

type QueueSchemaFacts = { owner: string; usable_by: string | null; holders: string[] };

type QueueObject = {
  name: string;
  /** `table`, `sequence`, `function` or `procedure`, as a revoke names it. */
  kind: string;
  owner: string;
  reacher: string;
  holders: string[];
};

/**
 * T-490, T-491: what lets the website's login reach the job queue, in plain words, each with
 * the statements that mend it as the database's owner runs them: a membership of
 * queue_owner (directly or through other roles, whatever its options), and any right
 * PostgreSQL says the login or a role it reaches HAS (has_schema_privilege and its kin, not
 * the grant lists alone) on the queue's schema or on any table, sequence or function in it.
 * Empty means it reaches no queued job. Predefined roles (pg_write_all_data) are refused
 * before this is asked (predefined-roles.ts).
 */
export async function queueReachProblems(db: DatabaseHandle, reach: QueueReach): Promise<string[]> {
  const database = kyselyOf(db);
  const problems: string[] = [];
  const toOwner = reach.paths.find((path) => path.at(-1) === queueOwner);
  if (toOwner !== undefined) {
    // T-496: the way is cut at the website's own end, at the first role on it that the
    // website does not need (app_user and sign_in_store it does), so the worker's login,
    // reached that way, keeps its own membership of queue_owner.
    const cut = toOwner.findIndex(
      (role, place) => place > 0 && role !== 'app_user' && role !== 'sign_in_store',
    );
    const role = toOwner[cut] ?? queueOwner;
    const holder = toOwner[cut - 1] ?? reach.login;
    // A grant the holder made of it (it held ADMIN) hangs on its own: without cascade the
    // owner's revoke fails with "dependent privileges exist" (seen on the real server).
    const { rows } = await sql<{ hanging: boolean }>`
      select exists (
        select 1 from pg_catalog.pg_auth_members m
        join pg_catalog.pg_roles g on g.oid = m.roleid
        join pg_catalog.pg_roles h on h.oid = m.grantor
        where g.rolname = ${role} and h.rolname = ${holder}) as hanging`.execute(database);
    const through = toOwner.length > 2 ? ` through ${toOwner.slice(1, -1).join(', then ')}` : '';
    problems.push(
      `${reach.login} is a member of ${queueOwner}${through}, which owns the job queue ` +
        `(the ${queueSchema} schema), and the website must never read or change a queued ` +
        `job: revoke ${role} from ${holder}${rows[0]?.hanging === true ? ' cascade' : ''}`,
    );
  }
  if (reach.superuser) return problems;
  const reached = reach.paths.map((path) => path.at(-1) ?? '');
  const roles = JSON.stringify(reached);
  const { rows } = await sql<QueueSchemaFacts>`
    select pg_catalog.pg_get_userbyid(n.nspowner)::text as owner,
      (select r.name from pg_catalog.jsonb_array_elements_text(${roles}::jsonb)
          with ordinality as r(name, place)
       join pg_catalog.pg_roles g on g.rolname = r.name
       -- A superuser reaches everything, and is named as one by checkLoginRole.
       where not g.rolsuper and pg_catalog.has_schema_privilege(r.name, n.oid, 'USAGE, CREATE')
       order by r.place limit 1) as usable_by,
      array(
        select distinct case when e.grantee = 0 then 'public'
          else pg_catalog.pg_get_userbyid(e.grantee)::text end
        from pg_catalog.aclexplode(n.nspacl) e
        where e.grantee <> n.nspowner and (e.grantee = 0 or e.grantee in (
          select r.oid from pg_catalog.pg_roles r
          where r.rolname in (select pg_catalog.jsonb_array_elements_text(${roles}::jsonb))))
        order by 1) as holders
    from pg_catalog.pg_namespace n where n.nspname = ${queueSchema}`.execute(database);
  const schema = rows[0];
  if (schema === undefined) return problems;
  if (schema.owner !== queueOwner && reached.includes(schema.owner)) {
    problems.push(
      `${reach.login} owns the job queue (the ${queueSchema} schema)${
        schema.owner === reach.login ? '' : ` through ${schema.owner}`
      }, and the website must never read or change a queued job: ` + giveSchemaToQueueOwner,
    );
  }
  if (schema.holders.length > 0) {
    // The grants were made by queue_owner, the schema's owner: only it may take them back.
    const holders = schema.holders.join(', ');
    problems.push(
      `${holders} may use the job queue (the ${queueSchema} schema), so ` +
        `${reach.login} could read or change a queued job: ` +
        asRole(
          queueOwner,
          `revoke all on schema ${queueSchema} from ${holders} cascade`,
          reach.databaseOwner,
        ),
    );
  }
  if (schema.usable_by !== null && problems.length === 0) {
    problems.push(
      `${reach.login} may use the job queue (the ${queueSchema} schema) as ` +
        `${schema.usable_by}, by a way this check cannot name: ask the lead before it starts`,
    );
  }
  for (const object of await queueObjects(database, roles)) {
    const holders = object.holders.filter(
      (holder) => holder === 'public' || reached.includes(holder),
    );
    if (holders.length === 0 && problems.length > 0) continue;
    const who =
      object.reacher === reach.login ? reach.login : `${reach.login} as ${object.reacher}`;
    const statement =
      holders.length > 0
        ? asRole(
            object.owner,
            `revoke all on ${object.kind} ${object.name} from ${holders.join(', ')}`,
            reach.databaseOwner,
          )
        : 'ask the lead before it starts: this check cannot name the grant';
    problems.push(
      `${object.name} is a ${object.kind} of the job queue (the ${queueSchema} schema) that ` +
        `${who} has a right on, so the website could read or change a queued job: ${statement}`,
    );
  }
  return problems;
}

/**
 * Every table, sequence and function in the queue's schema that the login or a role it
 * reaches has any right on, as PostgreSQL judges it. A function counts when that right is
 * granted to such a role by name, or when it runs as its owner (security definer): every
 * function may be run by everyone unless revoked, and pg-boss's own are not definers.
 */
async function queueObjects(
  database: ReturnType<typeof kyselyOf>,
  roles: string,
): Promise<QueueObject[]> {
  const { rows } = await sql<QueueObject>`
    with reached as (
      select r.name, r.place, g.oid from pg_catalog.jsonb_array_elements_text(${roles}::jsonb)
        with ordinality as r(name, place)
      join pg_catalog.pg_roles g on g.rolname = r.name
      where not g.rolsuper
    )
    select * from (
      select pg_catalog.quote_ident(n.nspname) || '.' || pg_catalog.quote_ident(c.relname) as name,
        case when c.relkind = 'S' then 'sequence' else 'table' end as kind,
        pg_catalog.pg_get_userbyid(c.relowner)::text as owner,
        (select r.name from reached r
         where case when c.relkind = 'S'
             then pg_catalog.has_sequence_privilege(r.oid, c.oid, 'USAGE, SELECT, UPDATE')
             else pg_catalog.has_table_privilege(r.oid, c.oid,
                 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
               or pg_catalog.has_any_column_privilege(r.oid, c.oid,
                 'SELECT, INSERT, UPDATE, REFERENCES') end
         order by r.place limit 1) as reacher,
        array(
          select distinct case when e.grantee = 0 then 'public'
            else pg_catalog.pg_get_userbyid(e.grantee)::text end
          from (
            select (pg_catalog.aclexplode(c.relacl)).*
            union all
            select (pg_catalog.aclexplode(a.attacl)).* from pg_catalog.pg_attribute a
            where a.attrelid = c.oid and a.attacl is not null
          ) e
          where e.grantee <> c.relowner order by 1) as holders
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = ${queueSchema} and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
      union all
      select pg_catalog.quote_ident(n.nspname) || '.' || pg_catalog.quote_ident(p.proname) ||
          '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')',
        case when p.prokind = 'p' then 'procedure' else 'function' end,
        pg_catalog.pg_get_userbyid(p.proowner)::text,
        (select r.name from reached r
         where pg_catalog.has_function_privilege(r.oid, p.oid, 'EXECUTE')
           and (p.prosecdef or exists (
             select 1 from pg_catalog.aclexplode(p.proacl) e
             where e.grantee = r.oid and e.privilege_type = 'EXECUTE'))
         order by r.place limit 1),
        case when p.proacl is null then array['public']
          else array(
            select distinct case when e.grantee = 0 then 'public'
              else pg_catalog.pg_get_userbyid(e.grantee)::text end
            from pg_catalog.aclexplode(p.proacl) e
            where e.grantee <> p.proowner and e.privilege_type = 'EXECUTE'
              and (e.grantee <> 0 or p.prosecdef) order by 1)
          end
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = ${queueSchema} and p.prokind in ('f', 'p')
    ) objects
    where reacher is not null
    order by name`.execute(database);
  return rows;
}
