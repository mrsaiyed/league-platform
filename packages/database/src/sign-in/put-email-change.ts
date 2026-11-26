// A waiting change of email (T-455, 0032): replaces the sign-in user's earlier one, so
// its code is dead.
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';
import type { PendingEmailChange } from './sign-in-store-types.ts';

export async function putEmailChange(
  scope: SignInScope,
  userId: string,
  change: PendingEmailChange,
): Promise<void> {
  const row = {
    new_email: change.newEmail,
    code_hash: change.codeHash,
    expires_at: change.expiresAt,
    attempts_left: change.attemptsLeft,
  };
  await signInTransactionOf(scope)
    .insertInto('sign_in.email_changes')
    .values({ user_id: userId, ...row })
    .onConflict((conflict) => conflict.column('user_id').doUpdateSet(row))
    .execute();
}
