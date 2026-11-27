// A code asked for: replaces the code the same asker had for the address, the known
// device that asked or none (T-511). Each asker's entry is its own: an unknown device's
// ask leaves a known device's entry as it was, and the other way round.
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';
import type { PendingCode } from './sign-in-store-types.ts';

export async function putCode(scope: SignInScope, email: string, code: PendingCode): Promise<void> {
  const row = {
    verify_type: code.verifyType,
    expires_at: code.expiresAt,
    attempts_left: code.attemptsLeft,
  };
  await signInTransactionOf(scope)
    .insertInto('sign_in.codes')
    .values({ email, known_device: code.knownDevice, ...row })
    .onConflict((conflict) => conflict.columns(['email', 'known_device']).doUpdateSet(row))
    .execute();
}
