// Adds a device to a sign-in user's list (T-70): true if it was not on it. Like the
// in-memory store, this records the user too if it was not recorded yet.
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';

export async function rememberDevice(
  scope: SignInScope,
  userId: string,
  deviceId: string,
  at: Date,
): Promise<boolean> {
  const trx = signInTransactionOf(scope);
  await trx
    .insertInto('sign_in.users')
    .values({ user_id: userId })
    .onConflict((conflict) => conflict.column('user_id').doNothing())
    .execute();
  const added = await trx
    .insertInto('sign_in.devices')
    .values({ user_id: userId, device_id: deviceId, first_seen_at: at })
    .onConflict((conflict) => conflict.columns(['user_id', 'device_id']).doNothing())
    .returning('device_id')
    .executeTakeFirst();
  return added !== undefined;
}
