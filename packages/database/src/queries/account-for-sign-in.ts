// The account for a person the sign-in service has just proved holds their mailbox
// (a right code, Google, or a right password): record 052, T-221. Call it only
// then, with the service's user id and the address it proved. It goes through the
// narrow function public.account_for_sign_in (0012): the account already linked to
// that user, else the account with that address (now linked), else a new account.
// It returns the id and never says which of the three it was, so nothing built on
// it can tell a stranger whether an address has an account (T-68).
//
// It throws when the address's account is linked to another sign-in user: that
// happens only if the sign-in service made the person again, and is put right by
// hand (record 052). isSignInLinkConflict tells that error from any other, so the
// caller can answer it plainly (record 055); the transaction it was thrown in is
// over by then.
import { sql } from 'kysely';
import { transactionOf, type AppScope } from '../db/transaction-scope.ts';
import { constraintOf } from './constraint-of.ts';

export async function accountForSignIn(
  scope: AppScope,
  signInId: string,
  email: string,
): Promise<string> {
  const { rows } = await sql<{ account_id: string }>`
    select public.account_for_sign_in(${signInId}, ${email}) as account_id
  `.execute(transactionOf(scope));
  const accountId = rows[0]?.account_id;
  if (accountId === undefined) throw new Error('account_for_sign_in returned no account.');
  return accountId;
}

/** Whether `error` is accountForSignIn's refusal of an address linked to another sign-in user. */
export function isSignInLinkConflict(error: unknown): boolean {
  const found = constraintOf(error);
  return found?.code === '23505' && found.constraint === 'accounts_sign_in_id_key';
}
