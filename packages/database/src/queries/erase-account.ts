// Erases the signed-in account at its own request (T-52, T-220, record 052), through
// the narrow function public.erase_account (0012): only the account the transaction
// was opened for. Its row is emptied in place so history keeps valid links; its
// profiles that no other account reaches, its grants in every league and its rows in
// the sign-in store go. Refused, changing nothing, while it owns a league or one of
// its profiles is still linked to a league's person. Ending the person's user at the
// sign-in service, and checking the password again first (T-70), are the caller's.
import { sql } from 'kysely';
import { transactionOf, type AppScope } from '../db/transaction-scope.ts';

export type EraseAccountAnswer = 'erased' | 'owns-a-league' | 'profile-in-a-league';

const answers: readonly EraseAccountAnswer[] = ['erased', 'owns-a-league', 'profile-in-a-league'];

export async function eraseAccount(scope: AppScope): Promise<EraseAccountAnswer> {
  if (scope.accountId === null) {
    throw new Error('eraseAccount needs a transaction opened for an account.');
  }
  const { rows } = await sql<{ answer: string }>`
    select public.erase_account() as answer
  `.execute(transactionOf(scope));
  const answer = answers.find((known) => known === rows[0]?.answer);
  if (answer === undefined) throw new Error(`erase_account answered ${String(rows[0]?.answer)}.`);
  return answer;
}
