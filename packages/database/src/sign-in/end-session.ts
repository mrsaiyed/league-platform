// Ends one session: true if it was live. It stays on the list as ended.
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';

export async function endSession(scope: SignInScope, sessionId: string): Promise<boolean> {
  const ended = await signInTransactionOf(scope)
    .updateTable('sign_in.sessions')
    .set({ ended: true })
    .where('session_id', '=', sessionId)
    .where('ended', '=', false)
    .returning('session_id')
    .executeTakeFirst();
  return ended !== undefined;
}
