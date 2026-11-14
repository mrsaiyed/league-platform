// Which of our accounts a signed-in person is (record 052, T-221): the sign-in
// service names the person by its own user id, and this turns that into our account
// id, for every signed-in request, before any account is set. It goes through the
// narrow function public.account_of_sign_in (0012), one id at a time, which returns
// nothing but the account id. It takes no email, so it cannot tell anyone whether an
// address has an account (T-68).
import { sql } from 'kysely';
import { transactionOf, type AppScope } from '../db/transaction-scope.ts';

export async function findAccountOfSignIn(
  scope: AppScope,
  signInId: string,
): Promise<string | undefined> {
  const { rows } = await sql<{ account_id: string | null }>`
    select public.account_of_sign_in(${signInId}) as account_id
  `.execute(transactionOf(scope));
  return rows[0]?.account_id ?? undefined;
}
