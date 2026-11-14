// The session whose newest access token this is. An older one finds nothing: renewal
// replaces it.
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';
import { sessionFromRow } from './session-rows.ts';
import type { StoredSession } from './sign-in-store-types.ts';

export async function sessionByAccessToken(
  scope: SignInScope,
  accessTokenHash: string,
): Promise<StoredSession | undefined> {
  const row = await signInTransactionOf(scope)
    .selectFrom('sign_in.sessions')
    .selectAll()
    .where('access_token_hash', '=', accessTokenHash)
    .executeTakeFirst();
  return row === undefined ? undefined : sessionFromRow(row);
}
