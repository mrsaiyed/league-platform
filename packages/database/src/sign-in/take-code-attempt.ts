// One attempt at the address's code, if it has one that has not run out at `at`. Of
// two attempts at once, each takes its own: the update is the one step.
import { sql } from 'kysely';
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';
import { verifyTypeOf } from './proof-rows.ts';
import type { CodeAttempt } from './sign-in-store-types.ts';

export async function takeCodeAttempt(
  scope: SignInScope,
  email: string,
  at: Date,
): Promise<CodeAttempt> {
  const trx = signInTransactionOf(scope);
  const taken = await trx
    .updateTable('sign_in.codes')
    .set({ attempts_left: sql<number>`attempts_left - 1` })
    .where('email', '=', email)
    .where('expires_at', '>', at)
    .where('attempts_left', '>', 0)
    .returning(['verify_type', 'attempts_left'])
    .executeTakeFirst();
  if (taken !== undefined) {
    return {
      status: 'taken',
      verifyType: verifyTypeOf(taken.verify_type),
      attemptsLeft: taken.attempts_left,
    };
  }
  const pending = await trx
    .selectFrom('sign_in.codes')
    .select('expires_at')
    .where('email', '=', email)
    .executeTakeFirst();
  if (pending === undefined || at.getTime() >= pending.expires_at.getTime()) {
    return { status: 'none' };
  }
  return { status: 'used-up' };
}
