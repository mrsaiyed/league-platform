// A code asked for (T-225): counted against the address and the network, unless
// either has had its limit in the last hour; then nothing is counted and the longer
// wait is returned. As the in-memory store (record 018) does.
import { randomUUID } from 'node:crypto';
import { signInTransactionOf, type SignInScope } from '../db/sign-in-transaction.ts';
import type { Limited } from './sign-in-store-types.ts';
import { lockSubject } from './subject-lock.ts';

const hour = 60 * 60_000;

export type CodeRequest = {
  readonly email: string;
  readonly network: string;
  readonly perEmail: number;
  readonly perNetwork: number;
};

/** Seconds to wait if the subject has had `limit` requests in the hour before `at`, else null. */
async function hourlyWait(
  scope: SignInScope,
  subjectScope: 'email' | 'network',
  subject: string,
  limit: number,
  at: Date,
): Promise<number | null> {
  const trx = signInTransactionOf(scope);
  const hourAgo = new Date(at.getTime() - hour);
  await trx
    .deleteFrom('sign_in.code_requests')
    .where('scope', '=', subjectScope)
    .where('subject', '=', subject)
    .where('asked_at', '<=', hourAgo)
    .execute();
  const recent = await trx
    .selectFrom('sign_in.code_requests')
    .select('asked_at')
    .where('scope', '=', subjectScope)
    .where('subject', '=', subject)
    .orderBy('asked_at')
    .execute();
  const oldest = recent[0]?.asked_at;
  if (oldest === undefined || recent.length < limit) return null;
  return Math.max(1, Math.ceil((oldest.getTime() + hour - at.getTime()) / 1000));
}

export async function countCodeRequest(
  scope: SignInScope,
  request: CodeRequest,
  at: Date,
): Promise<Limited | null> {
  await lockSubject(scope, 'code', 'network', request.network);
  await lockSubject(scope, 'code', 'email', request.email);
  const waits = [
    await hourlyWait(scope, 'email', request.email, request.perEmail, at),
    await hourlyWait(scope, 'network', request.network, request.perNetwork, at),
  ].filter((wait) => wait !== null);
  if (waits.length) return { retryAfterSeconds: Math.max(...waits) };
  await signInTransactionOf(scope)
    .insertInto('sign_in.code_requests')
    .values([
      { id: randomUUID(), scope: 'email', subject: request.email, asked_at: at },
      { id: randomUUID(), scope: 'network', subject: request.network, asked_at: at },
    ])
    .execute();
  return null;
}
