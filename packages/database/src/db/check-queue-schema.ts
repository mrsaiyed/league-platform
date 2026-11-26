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
        `alter schema ${queueSchema} owner to ${queueOwner}`,
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

/** The website's login, and every role it reaches with the way there (checkLoginRole's). */
export type QueueReach = {
  readonly login: string;
  /** A superuser reaches everything; its being one is reported by checkLoginRole. */
  readonly superuser: boolean;
  /** Each from the login to a role it is a member of, at any depth, both ends included. */
  readonly paths: readonly (readonly string[])[];
};

/**
 * T-490: what lets the website's login reach the job queue, in plain words, each with the
 * one statement that mends it: a membership of queue_owner (directly or through other
 * roles, whatever its options), and any other right on the queue's schema held by the
 * login, a role it reaches or everyone. Empty means it reaches no queued job.
 */
export async function queueReachProblems(db: DatabaseHandle, reach: QueueReach): Promise<string[]> {
  const problems: string[] = [];
  const toOwner = reach.paths.find((path) => path.at(-1) === queueOwner);
  if (toOwner !== undefined) {
    const through = toOwner.length > 2 ? ` through ${toOwner.slice(1, -1).join(', then ')}` : '';
    problems.push(
      `${reach.login} is a member of ${queueOwner}${through}, which owns the job queue ` +
        `(the ${queueSchema} schema), and the website must never read or change a queued ` +
        `job: revoke ${queueOwner} from ${toOwner.at(-2) ?? reach.login}`,
    );
  }
  if (reach.superuser) return problems;
  const roles = JSON.stringify(reach.paths.map((path) => path.at(-1) ?? ''));
  const { rows } = await sql<{ owner: string; holders: string[] }>`
    select pg_catalog.pg_get_userbyid(n.nspowner)::text as owner,
      array(
        select distinct case when e.grantee = 0 then 'public'
          else pg_catalog.pg_get_userbyid(e.grantee)::text end
        from pg_catalog.aclexplode(n.nspacl) e
        where e.grantee <> n.nspowner and (e.grantee = 0 or e.grantee in (
          select r.oid from pg_catalog.pg_roles r
          where r.rolname in (select pg_catalog.jsonb_array_elements_text(${roles}::jsonb))))
        order by 1) as holders
    from pg_catalog.pg_namespace n where n.nspname = ${queueSchema}`.execute(kyselyOf(db));
  const schema = rows[0];
  if (schema === undefined) return problems;
  const reached = reach.paths.map((path) => path.at(-1));
  if (schema.owner !== queueOwner && reached.includes(schema.owner)) {
    problems.push(
      `${reach.login} owns the job queue (the ${queueSchema} schema)${
        schema.owner === reach.login ? '' : ` through ${schema.owner}`
      }, and the website must never read or change a queued job: ` +
        `alter schema ${queueSchema} owner to ${queueOwner}`,
    );
  }
  if (schema.holders.length > 0) {
    problems.push(
      `${schema.holders.join(', ')} may use the job queue (the ${queueSchema} schema), so ` +
        `${reach.login} could read or change a queued job: ` +
        `revoke all on schema ${queueSchema} from ${schema.holders.join(', ')}`,
    );
  }
  return problems;
}
