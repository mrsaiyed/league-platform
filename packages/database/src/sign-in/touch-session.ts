// The session was used now (the device list shows when, T-71).
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';

export async function touchSession(scope: SignInScope, sessionId: string, at: Date): Promise<void> {
  await signInTransactionOf(scope)
    .updateTable('sign_in.sessions')
    .set({ last_active_at: at })
    .where('session_id', '=', sessionId)
    .execute();
}
