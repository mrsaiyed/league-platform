// Step 2.112's second fix round (T-495): nothing that no migration made may hang on a
// relation or schema the migrations made. Seen on the real server: the worker, given the
// right to reference sign_in.code_requests, made a table in the job queue's schema with a
// foreign key on it (on delete cascade) and a security-definer trigger, so the website's
// own delete of a code request wrote queued jobs, and both starts passed. Each start reads,
// whoever it judges:
//   (a) every foreign key from a relation no migration made to one they made, in any
//       schema, pgboss included: mended by dropping the constraint (no row is lost);
//   (b) every REFERENCES or TRIGGER right on a relation they made, held by anyone but its
//       owner (the migrations grant neither): mended by revoking it;
//   (c) every USAGE or CREATE right on a schema they made held by queue_owner or by a role
//       only the worker's login reaches (not app_user, not sign_in_store, nor what those
//       reach); the migrations grant those schemas to app_user and sign_in_store alone.
// Each is named in a plain sentence with the statement the database's owner runs.
import { sql, type Kysely } from 'kysely';
import { queueOwner } from './check-queue-schema.ts';
import type { MigrationCatalog } from './fence-catalog.ts';
import { asRole } from './mending.ts';
import type { Database } from './schema-types.ts';

/** The roles the website's and the worker's logins share, and need (records 052, 053). */
const sharedRoles = ['app_user', 'sign_in_store'];

/** PostgreSQL 15 on gives public to pg_database_owner, whose rights the owner holds. */
const runnerOf = (owner: string, databaseOwner: string) =>
  owner === 'pg_database_owner' ? databaseOwner : owner;

/** (a) A foreign key on a relation the migrations made, from one they did not make. */
async function strangeForeignKeys(
  database: Kysely<Database>,
  theirs: string,
  databaseOwner: string,
): Promise<string[]> {
  const { rows } = await sql<{ key: string; from: string; owner: string; to: string }>`
    select * from (
      select pg_catalog.quote_ident(k.conname) as key,
        pg_catalog.quote_ident(fn.nspname) || '.' || pg_catalog.quote_ident(f.relname) as "from",
        pg_catalog.pg_get_userbyid(f.relowner)::text as owner,
        pg_catalog.quote_ident(tn.nspname) || '.' || pg_catalog.quote_ident(t.relname) as "to"
      from pg_catalog.pg_constraint k
      join pg_catalog.pg_class f on f.oid = k.conrelid
      join pg_catalog.pg_namespace fn on fn.oid = f.relnamespace
      join pg_catalog.pg_class t on t.oid = k.confrelid
      join pg_catalog.pg_namespace tn on tn.oid = t.relnamespace
      where k.contype = 'f' and k.conparentid = 0
    ) keys
    where "to" in (select pg_catalog.jsonb_array_elements_text(${theirs}::jsonb))
      and "from" not in (select pg_catalog.jsonb_array_elements_text(${theirs}::jsonb))
    order by "from", key`.execute(database);
  return rows.map(
    (found) =>
      `${found.from}, which no migration made, has a foreign key ${found.key} on ${found.to}, ` +
      `which they made, so a change to a league's rows there may run what ${found.owner} ` +
      `put on ${found.from} (a cascade into a trigger), and ${found.owner} may test which ` +
      `rows exist past the league fence (T-495): ` +
      asRole(
        runnerOf(found.owner, databaseOwner),
        `alter table ${found.from} drop constraint ${found.key}`,
        databaseOwner,
      ),
  );
}

/** (b) A REFERENCES or TRIGGER right on a relation the migrations made, held by another. */
async function strangeRelationRights(
  database: Kysely<Database>,
  theirs: string,
  databaseOwner: string,
): Promise<string[]> {
  const { rows } = await sql<{ name: string; owner: string; holders: string[] }>`
    select * from (
      select pg_catalog.quote_ident(n.nspname) || '.' || pg_catalog.quote_ident(c.relname) as name,
        pg_catalog.pg_get_userbyid(c.relowner)::text as owner,
        array(
          select distinct case when e.grantee = 0 then 'public'
            else pg_catalog.pg_get_userbyid(e.grantee)::text end
          from (
            select (pg_catalog.aclexplode(c.relacl)).*
            union all
            select (pg_catalog.aclexplode(a.attacl)).* from pg_catalog.pg_attribute a
            where a.attrelid = c.oid and a.attacl is not null
          ) e
          where e.grantee <> c.relowner and e.privilege_type in ('REFERENCES', 'TRIGGER')
          order by 1) as holders
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p', 'v', 'm', 'f')
    ) relations
    where name in (select pg_catalog.jsonb_array_elements_text(${theirs}::jsonb))
      and pg_catalog.cardinality(holders) > 0
    order by name`.execute(database);
  return rows.map((found) => {
    const holders = found.holders.join(', ');
    return (
      `${holders} may reference ${found.name}, which the migrations made, or put a trigger ` +
      `on it, which no migration grants, so a table no migration made may hang on a ` +
      `league's rows (T-495): ` +
      asRole(
        runnerOf(found.owner, databaseOwner),
        `revoke references, trigger on table ${found.name} from ${holders} cascade`,
        databaseOwner,
      )
    );
  });
}

/** (c) A use of a schema the migrations made by queue_owner or a role only the worker reaches. */
async function workerSchemaRights(
  database: Kysely<Database>,
  catalog: MigrationCatalog,
  databaseOwner: string,
): Promise<string[]> {
  const { rows } = await sql<{ schema: string; owner: string; holders: string[] }>`
    with queue as (
      select g.oid from pg_catalog.pg_roles g where g.rolname = ${queueOwner}
    ), worker_logins as (
      select l.oid from pg_catalog.pg_roles l, queue q
      where not l.rolsuper and l.rolname <> ${databaseOwner} and l.oid <> q.oid
        and pg_catalog.pg_has_role(l.oid, q.oid, 'MEMBER')
    ), shared as (
      select g.oid from pg_catalog.pg_roles g
      where g.rolname in (select pg_catalog.jsonb_array_elements_text(${JSON.stringify(sharedRoles)}::jsonb))
    ), workerish as (
      select q.oid from queue q
      union
      select r.oid from pg_catalog.pg_roles r
      where not r.rolsuper and r.rolname <> ${databaseOwner}
        and exists (select 1 from worker_logins l where pg_catalog.pg_has_role(l.oid, r.oid, 'MEMBER'))
        and not exists (select 1 from shared s where pg_catalog.pg_has_role(s.oid, r.oid, 'MEMBER'))
    )
    select * from (
      select pg_catalog.quote_ident(n.nspname) as schema,
        pg_catalog.pg_get_userbyid(n.nspowner)::text as owner,
        array(
          select distinct pg_catalog.pg_get_userbyid(e.grantee)::text
          from pg_catalog.aclexplode(n.nspacl) e
          where e.grantee <> n.nspowner and e.privilege_type in ('USAGE', 'CREATE')
            and e.grantee in (select w.oid from workerish w)
          order by 1) as holders
      from pg_catalog.pg_namespace n
      where n.nspname in (select pg_catalog.jsonb_array_elements_text(${JSON.stringify(catalog.schemas)}::jsonb))
    ) schemas
    where pg_catalog.cardinality(holders) > 0
    order by schema`.execute(database);
  return rows.map((found) => {
    const holders = found.holders.join(', ');
    return (
      `${holders} may use the schema ${found.schema}, which the migrations made and grant ` +
      `only to the website's roles, and ${holders} is the job queue's or reached only by ` +
      `the worker's login, so the worker may reach or make there what hangs on a league's ` +
      `rows (T-495): ` +
      asRole(
        runnerOf(found.owner, databaseOwner),
        `revoke usage, create on schema ${found.schema} from ${holders} cascade`,
        databaseOwner,
      )
    );
  });
}

/** T-495's three refusals, (a) to (c), for either login. */
export async function hangingProblems(
  database: Kysely<Database>,
  catalog: MigrationCatalog,
  databaseOwner: string,
): Promise<string[]> {
  const theirs = JSON.stringify(catalog.relations.map((relation) => relation.name));
  return [
    ...(await strangeForeignKeys(database, theirs, databaseOwner)),
    ...(await strangeRelationRights(database, theirs, databaseOwner)),
    ...(await workerSchemaRights(database, catalog, databaseOwner)),
  ];
}
