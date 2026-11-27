// The code one asker had for the address is forgotten (T-511): the known device's, or
// the one no known device asked for. The others' entries stay as they are.
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';

export async function dropCode(
  scope: SignInScope,
  email: string,
  knownDevice: string | null,
): Promise<void> {
  await signInTransactionOf(scope)
    .deleteFrom('sign_in.codes')
    .where('email', '=', email)
    .where('known_device', 'is not distinct from', knownDevice)
    .execute();
}
