// Moves the address of the account set for the transaction once the sign-in service has
// confirmed a change of email (T-73, T-256, T-458), through the narrow function
// public.change_own_email (0031), the only way accounts.email changes. `taken`: another
// account holds the address, and nothing changed.
import { sql } from 'kysely';
import { transactionOf, type AppScope } from '../db/transaction-scope.ts';

export type ChangeOwnEmailAnswer = 'changed' | 'taken';

const answers: readonly ChangeOwnEmailAnswer[] = ['changed', 'taken'];

export async function changeOwnEmail(
  scope: AppScope,
  email: string,
): Promise<ChangeOwnEmailAnswer> {
  if (scope.accountId === null) {
    throw new Error('changeOwnEmail needs a transaction opened for an account.');
  }
  const { rows } = await sql<{ answer: string }>`
    select public.change_own_email(${email}) as answer
  `.execute(transactionOf(scope));
  const answer = answers.find((known) => known === rows[0]?.answer);
  if (answer === undefined) {
    throw new Error(`change_own_email answered ${String(rows[0]?.answer)}.`);
  }
  return answer;
}
