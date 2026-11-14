// Ends every proof and code for the address.
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';
import { lockSubject } from './subject-lock.ts';

export async function dropProofsFor(scope: SignInScope, email: string): Promise<void> {
  const trx = signInTransactionOf(scope);
  await lockSubject(scope, 'proof', 'email', email);
  await trx.deleteFrom('sign_in.proofs').where('email', '=', email).execute();
  await trx.deleteFrom('sign_in.codes').where('email', '=', email).execute();
}
