// What the tool that makes a league (step 2.125, record 057) reads and writes as the
// migration login itself, outside any league's fence: the accounts it names by email,
// whether a short name is free, and whether the database has the migrations it needs.
// Accounts are not a league's rows and the app's role may not add one (0005, 0012), so
// this is the one place outside the owner-run functions that does.
import type { SqlSession } from '../migrations/index.ts';

/** The account with this email, whatever its capitals, or undefined. */
export async function findAccountByEmail(
  session: SqlSession,
  email: string,
): Promise<string | undefined> {
  const { rows } = await session.query<{ id: string }>(
    'select id from public.accounts where lower(email) = lower($1)',
    [email],
  );
  return rows[0]?.id;
}

/**
 * The account with this email, made with no name and no sign-in link when there is
 * none. Run inside a transaction: it holds the address's lock first, the same one
 * account_for_sign_in takes (0012), so a first sign-in at the same moment cannot make
 * a second account. The person's first sign-in links this account (record 052).
 */
export async function accountForEmail(
  tx: SqlSession,
  email: string,
): Promise<{ accountId: string; made: boolean }> {
  await tx.query(
    "select pg_advisory_xact_lock(hashtextextended('account_email:' || lower($1), 0))",
    [email],
  );
  const found = await findAccountByEmail(tx, email);
  if (found !== undefined) return { accountId: found, made: false };
  const { rows } = await tx.query<{ id: string }>(
    'insert into public.accounts (email) values ($1) returning id',
    [email],
  );
  const made = rows[0]?.id;
  if (made === undefined) throw new Error('The account was not made.');
  return { accountId: made, made: true };
}

/** Whether a league holds this short name, or still forwards from it (U-7). */
export async function isShortNameHeld(session: SqlSession, slug: string): Promise<boolean> {
  const { rows } = await session.query<{ league_id: string }>(
    'select league_id from public.find_league_by_slug($1)',
    [slug],
  );
  return rows.length > 0;
}

/** A new league's id, picked before it is made (record 008). */
export async function newLeagueId(session: SqlSession): Promise<string> {
  const { rows } = await session.query<{ id: string }>('select public.uuid_v7() as id');
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('No league id was given.');
  return id;
}

/** Whether the leagues table has every column the tool writes (migration 0014). */
export async function hasLeagueCity(session: SqlSession): Promise<boolean> {
  const { rows } = await session.query<{ found: boolean }>(
    `select exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'leagues' and column_name = 'city'
     ) as found`,
  );
  return rows[0]?.found === true;
}
