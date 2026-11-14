// Records that a sign-in user has finished signing up through us (record 018): the
// store's `claimAccount`. Of two callers at once, exactly one is told it was made.
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';

export async function claimSignInUser(
  scope: SignInScope,
  userId: string,
): Promise<{ readonly created: boolean }> {
  const made = await signInTransactionOf(scope)
    .insertInto('sign_in.users')
    .values({ user_id: userId })
    .onConflict((conflict) => conflict.column('user_id').doNothing())
    .returning('user_id')
    .executeTakeFirst();
  return { created: made !== undefined };
}
