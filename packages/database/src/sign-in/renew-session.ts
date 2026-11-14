// New tokens after a renewal: the old access token stops working, and the new
// renewing token is the session's newest. Nothing happens for a session not listed.
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';
import type { RenewedTokens } from './sign-in-store-types.ts';

export async function renewSession(
  scope: SignInScope,
  sessionId: string,
  tokens: RenewedTokens,
): Promise<void> {
  const trx = signInTransactionOf(scope);
  const renewed = await trx
    .updateTable('sign_in.sessions')
    .set({
      access_token_hash: tokens.accessTokenHash,
      access_expires_at: tokens.accessExpiresAt,
      refresh_token_hash: tokens.refreshTokenHash,
      last_active_at: tokens.at,
    })
    .where('session_id', '=', sessionId)
    .returning('session_id')
    .executeTakeFirst();
  if (renewed === undefined) return;
  await trx
    .insertInto('sign_in.refresh_tokens')
    .values({ token_hash: tokens.refreshTokenHash, session_id: sessionId, created_at: tokens.at })
    .onConflict((conflict) =>
      conflict.column('token_hash').doUpdateSet({ session_id: sessionId, used: false }),
    )
    .execute();
}
