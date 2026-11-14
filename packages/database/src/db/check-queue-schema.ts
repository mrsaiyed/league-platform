// T-257 (record 053): pg-boss keeps its own tables in the `pgboss` schema. On a hosted
// database the worker never creates a schema: the release makes `pgboss`, owned by the
// role queue_owner, and the worker's login is granted queue_owner, so pg-boss can make
// and upgrade its tables there and nothing in public. The worker calls this once at
// start-up, before pg-boss starts, and refuses to start on any problem, so a missing
// step of the release reads as plain words instead of a driver error.
import { sql } from 'kysely';
import { kyselyOf, type DatabaseHandle } from './database-handle.ts';

/** The schema pg-boss's own tables live in (create-pg-boss.ts). */
export const queueSchema = 'pgboss';

type SchemaFacts = { found: boolean; can_use: boolean; can_create: boolean };

/**
 * What stops the role the handle logs in as (or `role`, for tests) from running
 * pg-boss in its schema, in plain words. Empty means pg-boss can start.
 */
export async function checkQueueSchema(db: DatabaseHandle, role?: string): Promise<string[]> {
  const { rows } = await sql<SchemaFacts>`
    select n.oid is not null as found,
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
  // pg-boss needs both: USAGE to reach its tables, CREATE to make and upgrade them.
  const problems: string[] = [];
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
