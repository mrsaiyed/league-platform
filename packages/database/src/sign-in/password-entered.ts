// The password was typed again in this session (T-70): it counts as a sign-in too.
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';

export async function passwordEntered(
  scope: SignInScope,
  sessionId: string,
  at: Date,
): Promise<void> {
  await signInTransactionOf(scope)
    .updateTable('sign_in.sessions')
    .set({ password_entered_at: at, last_sign_in_at: at })
    .where('session_id', '=', sessionId)
    .execute();
}
