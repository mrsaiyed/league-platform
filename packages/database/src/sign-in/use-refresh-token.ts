// A renewing token used (T-69): the session's newest one, not used yet, is marked
// used in one update and reads as `current`; any other the session was given reads
// as `old`, which the adapter treats as copied. Of two uses at once, the second waits
// for the first's update and then finds it used.
import { sql } from 'kysely';
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';
import { sessionFromRow } from './session-rows.ts';
import type { RefreshTokenUse } from './sign-in-store-types.ts';

export async function useRefreshToken(
  scope: SignInScope,
  refreshTokenHash: string,
): Promise<RefreshTokenUse> {
  const trx = signInTransactionOf(scope);
  const marked = await trx
    .updateTable('sign_in.refresh_tokens')
    .set({ used: true })
    .where('token_hash', '=', refreshTokenHash)
    .where('used', '=', false)
    .where(({ exists, selectFrom }) =>
      exists(
        selectFrom('sign_in.sessions')
          .select(sql.lit(1).as('one'))
          .whereRef('sign_in.sessions.session_id', '=', 'sign_in.refresh_tokens.session_id')
          .where('sign_in.sessions.refresh_token_hash', '=', refreshTokenHash),
      ),
    )
    .returning('session_id')
    .executeTakeFirst();
  const session = await trx
    .selectFrom('sign_in.refresh_tokens')
    .innerJoin(
      'sign_in.sessions',
      'sign_in.sessions.session_id',
      'sign_in.refresh_tokens.session_id',
    )
    .selectAll('sign_in.sessions')
    .where('sign_in.refresh_tokens.token_hash', '=', refreshTokenHash)
    .executeTakeFirst();
  if (session === undefined) return { status: 'unknown' };
  return { status: marked === undefined ? 'old' : 'current', session: sessionFromRow(session) };
}
