// A code asked for: replaces any code the address had.
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
    .values({ email, ...row })
    .onConflict((conflict) => conflict.column('email').doUpdateSet(row))
    .execute();
}
