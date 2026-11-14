// A sign-in user now has a password. Like the in-memory store, this records the user
// too if it was not recorded yet.
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';

export async function setHasPassword(scope: SignInScope, userId: string): Promise<void> {
  await signInTransactionOf(scope)
    .insertInto('sign_in.users')
    .values({ user_id: userId, has_password: true })
    .onConflict((conflict) => conflict.column('user_id').doUpdateSet({ has_password: true }))
    .execute();
}
