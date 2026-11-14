// Undoes useRefreshToken after Supabase could not be reached, so the token may be
// tried again (record 018).
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';

export async function releaseRefreshToken(
  scope: SignInScope,
  refreshTokenHash: string,
): Promise<void> {
  await signInTransactionOf(scope)
    .updateTable('sign_in.refresh_tokens')
    .set({ used: false })
    .where('token_hash', '=', refreshTokenHash)
    .execute();
}
