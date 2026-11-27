// Ends every proof for the address once its password is set, and the owner's own codes:
// those a known device asked for. Every other asker's entry stays, its code removed and
// its attempts and expiry unchanged, so a stranger's next try answers as at an address
// with no account (T-522, T-68).
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';
import { lockSubject } from './subject-lock.ts';

export async function dropProofsFor(scope: SignInScope, email: string): Promise<void> {
  const trx = signInTransactionOf(scope);
  await lockSubject(scope, 'proof', 'email', email);
  await trx.deleteFrom('sign_in.proofs').where('email', '=', email).execute();
  await trx
    .deleteFrom('sign_in.codes')
    .where('email', '=', email)
    .where('known_device', 'is not', null)
    .execute();
  await trx
    .updateTable('sign_in.codes')
    .set({ verify_type: null })
    .where('email', '=', email)
    .where('known_device', 'is', null)
    .execute();
}
