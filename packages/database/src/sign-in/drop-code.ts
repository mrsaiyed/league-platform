// The address's code is forgotten.
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';

export async function dropCode(scope: SignInScope, email: string): Promise<void> {
  await signInTransactionOf(scope).deleteFrom('sign_in.codes').where('email', '=', email).execute();
}
