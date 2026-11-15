// The owner's account of a league removed by mistake (step 2.150, record 063): kept
// unless the database shows for certain that it was made ahead and never used.
//
// What the database records (record 052, 0012): the maker adds the account with only
// an email (no name, no phone, version 1). The first sign-in links it
// (accounts.sign_in_id, written only by account_for_sign_in, an update that moves its
// version); erasure empties the link again but rewrites the email to
// <id>@erased.invalid (also an update). A device, a session or a sign-up is kept by
// the sign-in store under that same sign-in id, so an account with no link has none.
// So "nobody ever signed in" is: no link, never updated since it was made, and not
// erased. Anything else, or anything that cannot be read, keeps it.
import type { SqlSession } from '../migrations/index.ts';
import { removeUnusedAccount } from './login-queries.ts';

/** Why the account is kept. */
export type AccountKept =
  /** It has a sign-in link, or was erased: someone signed in with it. */
  | 'signed-in'
  /** It changed after it was made (a name, a phone, last seen, a profile). */
  | 'used'
  /** It owns another league. */
  | 'owns-league'
  /** It holds, or held, a role in some league. */
  | 'has-roles'
  /** It is the account of our staff member who ran the removal (the platform log names it). */
  | 'is-staff'
  /** Something else in the database still points at it, so it could not be removed. */
  | 'still-used'
  /** It could not be read or removed: kept, to be safe. */
  | 'unknown';

/**
 * Why this account must be kept; empty when it was made ahead and never used. Before
 * the removal, the plan asks with `leagueBeingRemoved`, which is not counted as
 * another league it owns.
 */
export async function ownerAccountKept(
  session: SqlSession,
  accountId: string,
  staffAccountId: string,
  leagueBeingRemoved: string | null = null,
): Promise<AccountKept[]> {
  const { rows } = await session.query<{
    signed_in: boolean;
    used: boolean;
    owns_league: boolean;
    has_roles: boolean;
  }>(
    `select a.sign_in_id is not null or a.email like '%@erased.invalid' as signed_in,
            a.version <> 1 or a.last_seen_at is not null or a.display_name is not null
              or a.phone is not null
              or exists (select 1 from public.profile_access p where p.account_id = a.id) as used,
            exists (select 1 from public.leagues l
                    where l.owner_account_id = a.id and l.id is distinct from $2::uuid) as owns_league,
            exists (select 1 from public.role_grants g where g.account_id = a.id) as has_roles
     from public.accounts a where a.id = $1`,
    [accountId, leagueBeingRemoved],
  );
  const row = rows[0];
  if (row === undefined) return ['unknown'];
  const kept: AccountKept[] = [];
  if (row.signed_in) kept.push('signed-in');
  if (row.used) kept.push('used');
  if (row.owns_league) kept.push('owns-league');
  if (row.has_roles) kept.push('has-roles');
  if (accountId === staffAccountId) kept.push('is-staff');
  return kept;
}

/** What became of the owner's account. */
export type OwnerAccountOutcome =
  | { readonly removed: true }
  | { readonly removed: false; readonly kept: readonly AccountKept[] };

/**
 * After the league is gone: removes its owner's account only when nothing shows it
 * was used, through removeUnusedAccount (which takes the address's lock and checks
 * the sign-in link again, so a first sign-in at the same moment wins), in one
 * transaction of the migration login. Never throws: anything unexpected keeps it.
 */
export async function removeOwnerAccountIfUnused(
  login: {
    readonly transaction: <T>(fn: (tx: SqlSession) => Promise<T>) => Promise<T>;
  },
  account: { readonly accountId: string; readonly email: string },
  staffAccountId: string,
): Promise<OwnerAccountOutcome> {
  try {
    return await login.transaction(async (tx) => {
      const kept = await ownerAccountKept(tx, account.accountId, staffAccountId);
      if (kept.length > 0) return { removed: false, kept };
      return (await removeUnusedAccount(tx, account))
        ? { removed: true }
        : { removed: false, kept: ['signed-in'] };
    });
  } catch (error) {
    // A row this code does not know of still links to it (a foreign key refused the
    // delete); anything else, such as a lost connection, is not known.
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : '';
    return { removed: false, kept: [code === '23503' ? 'still-used' : 'unknown'] };
  }
}
