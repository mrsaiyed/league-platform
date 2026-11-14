// Ends a sign-in user's live sessions except `keep` ("sign out everywhere", T-71; a
// new password, T-85): how many were ended.
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';

export async function endSessionsOf(
  scope: SignInScope,
  userId: string,
  keep: string | undefined,
): Promise<number> {
  let query = signInTransactionOf(scope)
    .updateTable('sign_in.sessions')
    .set({ ended: true })
    .where('user_id', '=', userId)
    .where('ended', '=', false);
  if (keep !== undefined) query = query.where('session_id', '<>', keep);
  const ended = await query.returning('session_id').execute();
  return ended.length;
}
