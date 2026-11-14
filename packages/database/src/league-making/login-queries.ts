// What the tool that makes a league (step 2.125, record 057) reads and writes as the
// migration login itself, outside any league's fence: the accounts it names by email,
// which league holds a short name, and the database's migration log. Accounts are not
// a league's rows and the app's role may neither add nor remove one (0005, 0012), so
// this is the one place outside the owner-run functions that does.
import type { SqlSession } from '../migrations/index.ts';

/** An account found by email: whether anyone has signed in with it (its sign-in link). */
export type AccountByEmail = { readonly accountId: string; readonly signedUp: boolean };

/** The account with this email, whatever its capitals, or undefined. */
export async function accountByEmail(
  session: SqlSession,
  email: string,
): Promise<AccountByEmail | undefined> {
  const { rows } = await session.query<{ id: string; signed_up: boolean }>(
    'select id, sign_in_id is not null as signed_up from public.accounts where lower(email) = lower($1)',
    [email],
  );
  const row = rows[0];
  return row === undefined ? undefined : { accountId: row.id, signedUp: row.signed_up };
}

/** The address's lock, the same one account_for_sign_in takes (0012). */
async function lockAddress(tx: SqlSession, email: string): Promise<void> {
  await tx.query(
    "select pg_advisory_xact_lock(hashtextextended('account_email:' || lower($1), 0))",
    [email],
  );
}

/**
 * The account with this email, made with no name and no sign-in link when there is
 * none (`made`). Run inside a transaction: it holds the address's lock first, so a
 * first sign-in at the same moment cannot make a second account. The person's first
 * sign-in, once the sign-in service has proved the mailbox, links this account
 * (record 052).
 */
export async function accountForEmail(
  tx: SqlSession,
  email: string,
): Promise<AccountByEmail & { readonly made: boolean }> {
  await lockAddress(tx, email);
  const found = await accountByEmail(tx, email);
  if (found !== undefined) return { ...found, made: false };
  const { rows } = await tx.query<{ id: string }>(
    'insert into public.accounts (email) values ($1) returning id',
    [email],
  );
  const made = rows[0]?.id;
  if (made === undefined) throw new Error('The account was not made.');
  return { accountId: made, signedUp: false, made: true };
}

/**
 * Removes an account this run made, when its league was not made: only while nobody
 * has signed in with it and no league is owned by it. Any other row that points at it
 * makes the database refuse, and the account stays. Run inside a transaction: it
 * holds the address's lock, so a first sign-in cannot link it meanwhile. True if it
 * was removed.
 */
export async function removeUnusedAccount(
  tx: SqlSession,
  account: { readonly accountId: string; readonly email: string },
): Promise<boolean> {
  await lockAddress(tx, account.email);
  const { rows } = await tx.query<{ id: string }>(
    `delete from public.accounts a
     where a.id = $1 and a.sign_in_id is null
       and not exists (select 1 from public.leagues l where l.owner_account_id = a.id)
     returning a.id`,
    [account.accountId],
  );
  return rows.length === 1;
}

/** The league that holds this short name, or still forwards from it (U-7), if any. */
export async function leagueHoldingShortName(
  session: SqlSession,
  slug: string,
): Promise<string | undefined> {
  const { rows } = await session.query<{ league_id: string }>(
    'select league_id from public.find_league_by_slug($1)',
    [slug],
  );
  return rows[0]?.league_id;
}

/** A new league's id, picked before it is made (record 008). */
export async function newLeagueId(session: SqlSession): Promise<string> {
  const { rows } = await session.query<{ id: string }>('select public.uuid_v7() as id');
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('No league id was given.');
  return id;
}

/** One file the migration runner recorded as applied (T-48). */
export type AppliedMigration = {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
};

/**
 * The migration log, in order, or undefined when the database has none (no migration
 * was ever applied by the runner).
 */
export async function appliedMigrations(
  session: SqlSession,
): Promise<readonly AppliedMigration[] | undefined> {
  const { rows: found } = await session.query<{ found: boolean }>(
    "select to_regclass('migration_log.applied') is not null as found",
  );
  if (found[0]?.found !== true) return undefined;
  const { rows } = await session.query<{ version: number; name: string; checksum: string }>(
    'select version, name, checksum from migration_log.applied order by version',
  );
  return rows.map((row) => ({
    version: Number(row.version),
    name: row.name,
    checksum: row.checksum,
  }));
}
