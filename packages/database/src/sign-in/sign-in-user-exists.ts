// Whether a sign-in user has finished signing up through us: the store's `accountExists`.
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';

export async function signInUserExists(scope: SignInScope, userId: string): Promise<boolean> {
  const found = await signInTransactionOf(scope)
    .selectFrom('sign_in.users')
    .select('user_id')
    .where('user_id', '=', userId)
    .executeTakeFirst();
  return found !== undefined;
}
