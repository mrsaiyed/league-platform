// The sign-in user's waiting change of email is forgotten (T-455).
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';

export async function dropEmailChange(scope: SignInScope, userId: string): Promise<void> {
  await signInTransactionOf(scope)
    .deleteFrom('sign_in.email_changes')
    .where('user_id', '=', userId)
    .execute();
}
