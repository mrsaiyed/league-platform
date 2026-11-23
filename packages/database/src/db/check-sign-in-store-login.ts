// Record 052: the sign-in store's tables (schema sign_in) are reached only by the role
// sign_in_store, which the app's login must be a member of, by a grant made by hand where
// the login is made (`grant sign_in_store to <the app's login>;`). Without it the first
// sign-in fails with "permission denied to set role", so the web app asks at start-up,
// before anyone can sign in, and refuses to start on any problem (step 2.93's last part).
//
// It asks twice: whether the login is a member of the role, and then, in one store
// transaction that does nothing, whether the switch itself works (on PostgreSQL 16 and
// later a grant can be made without the right to switch).
import { sql } from 'kysely';
import { kyselyOf, type DatabaseHandle } from './database-handle.ts';
import { withSignInTransaction } from './sign-in-transaction.ts';

type StoreFacts = { found: boolean; member: boolean };

/**
 * What is wrong with the login's reach of the sign-in store, in plain words. Empty means
 * the app's login can act as sign_in_store.
 */
export async function checkSignInStoreLogin(db: DatabaseHandle): Promise<string[]> {
  const { rows } = await sql<StoreFacts>`
    select exists (select 1 from pg_catalog.pg_roles where rolname = 'sign_in_store') as found,
      exists (
        select 1 from pg_catalog.pg_roles r
        where r.rolname = 'sign_in_store' and pg_catalog.pg_has_role(session_user, r.oid, 'MEMBER')
      ) as member`.execute(kyselyOf(db));
  const facts = rows[0];
  if (facts === undefined || !facts.found) {
    return ['the role sign_in_store does not exist (the migrations are not all applied)'];
  }
  if (!facts.member) return ['it is not a member of sign_in_store'];
  try {
    await withSignInTransaction(db, async () => {});
  } catch {
    // The driver's message may hold the address; it is not repeated.
    return ['it cannot switch to sign_in_store'];
  }
  return [];
}
