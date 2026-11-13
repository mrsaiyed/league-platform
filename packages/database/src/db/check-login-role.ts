// T-60: the app must log in as a role row-level security fences. withTransaction
// drops every transaction to app_user, but the login role's own powers are what a
// query would have if it ever escaped that, so the login must have none to spare.
// The app calls this once at startup and refuses to start on any problem.
import { sql } from 'kysely';
import { kyselyOf, type DatabaseHandle } from './database-handle.ts';

type RoleFacts = {
  found: boolean;
  superuser: boolean;
  bypasses_rls: boolean;
  owns_tables: boolean;
  is_app_user: boolean;
};

/**
 * What is wrong with the role the handle logs in as (or `role`, for tests), in
 * plain words. Empty means it is fit for the app.
 */
export async function checkLoginRole(db: DatabaseHandle, role?: string): Promise<string[]> {
  const { rows } = await sql<RoleFacts>`
    select count(r.oid) > 0 as found,
      coalesce(bool_or(r.rolsuper), false) as superuser,
      coalesce(bool_or(r.rolbypassrls), false) as bypasses_rls,
      coalesce(bool_or(exists (
        select 1 from pg_catalog.pg_tables t
        where t.schemaname = 'public' and pg_catalog.pg_has_role(r.oid, t.tableowner, 'MEMBER')
      )), false) as owns_tables,
      coalesce(bool_or(pg_catalog.pg_has_role(r.oid, 'app_user', 'MEMBER')), false) as is_app_user
    from pg_catalog.pg_roles r
    where r.rolname = coalesce(${role ?? null}::text, session_user)`.execute(kyselyOf(db));
  const facts = rows[0];
  if (facts === undefined || !facts.found) return ['the login role does not exist'];
  const problems: string[] = [];
  if (facts.superuser) problems.push('it is a superuser');
  if (facts.bypasses_rls) problems.push('it bypasses row-level security');
  if (facts.owns_tables) problems.push('it owns tables in public, or can act as their owner');
  if (!facts.is_app_user) problems.push('it is not app_user and not a member of app_user');
  return problems;
}
