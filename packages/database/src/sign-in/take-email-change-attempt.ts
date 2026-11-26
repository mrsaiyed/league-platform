// One attempt at the sign-in user's own waiting change of email, if it has one that has
// not run out at `at` (T-455). Of two attempts at once, each takes its own: the update is
// the one step.
import { sql } from 'kysely';
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';
import type { EmailChangeAttempt } from './sign-in-store-types.ts';

export async function takeEmailChangeAttempt(
  scope: SignInScope,
  userId: string,
  at: Date,
): Promise<EmailChangeAttempt> {
  const trx = signInTransactionOf(scope);
  const taken = await trx
    .updateTable('sign_in.email_changes')
    .set({ attempts_left: sql<number>`attempts_left - 1` })
    .where('user_id', '=', userId)
    .where('expires_at', '>', at)
    .where('attempts_left', '>', 0)
    .returning(['new_email', 'code_hash', 'attempts_left'])
    .executeTakeFirst();
  if (taken !== undefined) {
    return {
      status: 'taken',
      newEmail: taken.new_email,
      codeHash: taken.code_hash,
      attemptsLeft: taken.attempts_left,
    };
  }
  const pending = await trx
    .selectFrom('sign_in.email_changes')
    .select('expires_at')
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (pending === undefined || at.getTime() >= pending.expires_at.getTime()) {
    return { status: 'none' };
  }
  return { status: 'used-up' };
}
