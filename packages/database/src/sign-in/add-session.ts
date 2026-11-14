// A new session on the list (T-71), with its first renewing token. A session id seen
// before is replaced, as in the in-memory store.
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';
import type { NewSession } from './sign-in-store-types.ts';

export async function addSession(scope: SignInScope, session: NewSession): Promise<void> {
  const trx = signInTransactionOf(scope);
  const row = {
    user_id: session.accountId,
    device_label: session.deviceLabel,
    signed_in_at: session.signedInAt,
    last_active_at: session.lastActiveAt,
    last_sign_in_at: session.lastSignInAt,
    password_entered_at: session.passwordEnteredAt,
    access_token_hash: session.accessTokenHash,
    access_expires_at: session.accessExpiresAt,
    refresh_token_hash: session.refreshTokenHash,
    ended: session.ended,
  };
  await trx
    .insertInto('sign_in.sessions')
    .values({ session_id: session.sessionId, ...row })
    .onConflict((conflict) => conflict.column('session_id').doUpdateSet(row))
    .execute();
  await trx
    .insertInto('sign_in.refresh_tokens')
    .values({
      token_hash: session.refreshTokenHash,
      session_id: session.sessionId,
      created_at: session.signedInAt,
    })
    .onConflict((conflict) =>
      conflict.column('token_hash').doUpdateSet({ session_id: session.sessionId, used: false }),
    )
    .execute();
}
