// A sign-in user's live sessions, for the device list (T-71), oldest first.
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';
import { sessionFromRow } from './session-rows.ts';
import type { StoredSession } from './sign-in-store-types.ts';

export async function liveSessionsOf(scope: SignInScope, userId: string): Promise<StoredSession[]> {
  const rows = await signInTransactionOf(scope)
    .selectFrom('sign_in.sessions')
    .selectAll()
    .where('user_id', '=', userId)
    .where('ended', '=', false)
    .orderBy('signed_in_at')
    .orderBy('session_id')
    .execute();
  return rows.map(sessionFromRow);
}
