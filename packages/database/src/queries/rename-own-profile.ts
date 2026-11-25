// The signed-in account's own name (R-21, step 2.128): changes the first and last name on
// its own profile (relation 'self', record 052) and the account's display name, which the
// Admins page and the activity log show (access_list_names, A-14). Only for the account the
// transaction was opened for: both tables are fenced to it (0005). Called right after
// createOwnProfile too, so the name the person gave reaches the Admins page at once.
import { sql } from 'kysely';
import { transactionOf, type AppScope } from '../db/transaction-scope.ts';

export async function renameOwnProfile(
  scope: AppScope,
  name: { readonly firstName: string; readonly lastName: string },
): Promise<'renamed' | 'no-own-profile'> {
  if (scope.accountId === null) {
    throw new Error('renameOwnProfile needs a transaction opened for an account.');
  }
  const tx = transactionOf(scope);
  const { rows } = await sql<{ id: string }>`
    update public.profiles p
       set first_name = ${name.firstName}, last_name = ${name.lastName}
      from public.profile_access pa
     where pa.profile_id = p.id
       and pa.relation = 'self'
       and pa.account_id = ${scope.accountId}
    returning p.id
  `.execute(tx);
  if (rows.length === 0) return 'no-own-profile';
  await sql`
    update public.accounts
       set display_name = ${`${name.firstName} ${name.lastName}`}
     where id = ${scope.accountId}
  `.execute(tx);
  return 'renamed';
}
