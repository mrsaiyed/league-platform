// Whether the address's code, unexpired at `at`, was asked for by a known device
// (T-510): then an unknown device's ask does not replace it.
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';

export async function knownDeviceCodeWaiting(
  scope: SignInScope,
  email: string,
  at: Date,
): Promise<boolean> {
  const row = await signInTransactionOf(scope)
    .selectFrom('sign_in.codes')
    .select('email')
    .where('email', '=', email)
    .where('expires_at', '>', at)
    .where('known_device', 'is not', null)
    .executeTakeFirst();
  return row !== undefined;
}
