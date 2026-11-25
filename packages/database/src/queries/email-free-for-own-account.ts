// Whether no account but the one set for the transaction holds an address (T-73, T-458),
// through the narrow function public.email_free_for_own_account (0031). A yes or a no,
// never whose: the web app answers the person in the same words either way (T-68).
import { sql } from 'kysely';
import { transactionOf, type AppScope } from '../db/transaction-scope.ts';

export async function emailFreeForOwnAccount(scope: AppScope, email: string): Promise<boolean> {
  if (scope.accountId === null) {
    throw new Error('emailFreeForOwnAccount needs a transaction opened for an account.');
  }
  const { rows } = await sql<{ free: boolean }>`
    select public.email_free_for_own_account(${email}) as free
  `.execute(transactionOf(scope));
  const free = rows[0]?.free;
  if (typeof free !== 'boolean') throw new Error('email_free_for_own_account answered nothing.');
  return free;
}
