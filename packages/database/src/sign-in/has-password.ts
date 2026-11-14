// Whether a sign-in user has set a password through us (one made with Google may not).
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';

export async function hasPassword(scope: SignInScope, userId: string): Promise<boolean> {
  const found = await signInTransactionOf(scope)
    .selectFrom('sign_in.users')
    .select('has_password')
    .where('user_id', '=', userId)
    .executeTakeFirst();
  return found?.has_password ?? false;
}
